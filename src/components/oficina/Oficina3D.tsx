'use client'

/**
 * La oficina en 3D: un diorama flotante con un escritorio por departamento y un
 * personaje que trabaja, descansa o levanta la mano según lo que ese departamento
 * está haciendo. Al tocar un personaje se abre el chat con ese departamento.
 * Solo dibuja; el estado llega por props desde la página.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import type { EstadoDepartamento } from '@/lib/agent/eventos'

export type EstadoDeps = Record<Departamento, EstadoDepartamento>

interface Props {
    estados: EstadoDeps
    onSelect: (dep: Departamento) => void
    oscuro: boolean
    className?: string
}

const DEPS = Object.keys(DEPARTAMENTOS) as Departamento[]
/**
 * Posición de cada escritorio en el piso (x, z) y tono de piel/pelo del personaje.
 * Dos filas: cuatro puestos al fondo y hasta tres delante, frente a la recepción.
 */
const PUESTOS: Record<Departamento, { pos: [number, number]; piel: number; pelo: number }> = {
    ventas: { pos: [-5.1, -2.7], piel: 0xf1c9a5, pelo: 0x3b2a20 },
    marketing: { pos: [-1.7, -2.7], piel: 0xffdbac, pelo: 0x8b3a1f },
    seo: { pos: [1.7, -2.7], piel: 0xd9a066, pelo: 0x2b2b2b },
    finanzas: { pos: [5.1, -2.7], piel: 0xc68642, pelo: 0x1a1412 },
    operaciones: { pos: [-3.4, 0.7], piel: 0xe0ac69, pelo: 0x5a3a1e },
}

interface Personaje {
    grupo: THREE.Group
    cuerpo: THREE.Mesh
    cabeza: THREE.Group
    brazos: THREE.Mesh[]
    pantalla: THREE.CanvasTexture
    pantallaCtx: CanvasRenderingContext2D
    luz: THREE.PointLight
    aviso: THREE.Sprite
    teclado: THREE.Sprite
    anillo: THREE.Mesh
    color: string
    ultimoDibujo: number
}

/** Etiqueta tipo píldora dibujada en un canvas: nítida, con sombra y un punto de color. */
function etiqueta(texto: string, opts: { color: string; fondo: string; punto?: string; ancho?: number; alto?: number; peso?: number }): THREE.Sprite {
    const w = opts.ancho ?? 512
    const h = opts.alto ?? 128
    const c = document.createElement('canvas')
    c.width = w * 2
    c.height = h * 2
    const g = c.getContext('2d')!
    g.scale(2, 2)
    g.shadowColor = 'rgba(0,0,0,0.25)'
    g.shadowBlur = 14
    g.shadowOffsetY = 4
    g.fillStyle = opts.fondo
    g.beginPath()
    g.roundRect(12, 12, w - 24, h - 28, (h - 28) / 2)
    g.fill()
    g.shadowColor = 'transparent'
    let x = w / 2
    if (opts.punto) {
        g.fillStyle = opts.punto
        g.beginPath()
        g.arc(40, h / 2 - 2, 9, 0, Math.PI * 2)
        g.fill()
        x = w / 2 + 14
    }
    g.fillStyle = opts.color
    g.font = `${opts.peso ?? 600} ${Math.round(h * 0.36)}px Inter, system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(texto, x, h / 2 - 2)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    s.scale.set((w / h) * 0.55, 0.55, 1)
    return s
}

/** Textura del piso: losas grandes con junta fina y un leve veteado. */
function texturaPiso(oscuro: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const g = c.getContext('2d')!
    g.fillStyle = oscuro ? '#1c2531' : '#dde6ee'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 1400; i++) {
        g.fillStyle = oscuro ? `rgba(255,255,255,${Math.random() * 0.025})` : `rgba(20,40,60,${Math.random() * 0.035})`
        g.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 18 + 2, 1.2)
    }
    g.strokeStyle = oscuro ? 'rgba(255,255,255,0.07)' : 'rgba(20,40,60,0.12)'
    g.lineWidth = 3
    for (let i = 0; i <= 2; i++) {
        g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 512); g.stroke()
        g.beginPath(); g.moveTo(0, i * 256); g.lineTo(512, i * 256); g.stroke()
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(3.5, 2.5)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
}

function sombraSuave(): THREE.Sprite {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128)
    grad.addColorStop(0, 'rgba(0,0,0,0.45)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.9 }))
}

export default function Oficina3D({ estados, onSelect, oscuro, className }: Props) {
    const ref = useRef<HTMLDivElement>(null)
    const estadosRef = useRef(estados)
    const onSelectRef = useRef(onSelect)
    // Las props cambian cada 5 s; la escena las lee desde refs para no reconstruirse.
    useEffect(() => { estadosRef.current = estados }, [estados])
    useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        // ── Render ──
        const scene = new THREE.Scene()
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = oscuro ? 0.95 : 1.05
        el.appendChild(renderer.domElement)
        // Entorno neutro para que los materiales tengan reflejos y volumen sin cargar texturas
        const pmrem = new THREE.PMREMGenerator(renderer)
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        scene.environmentIntensity = oscuro ? 0.35 : 0.55

        const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100)
        const mira = new THREE.Vector3(-0.3, 0.1, -0.2)
        let distancia = 1
        // Con menos ancho la cámara se aleja para que quepan todos los escritorios y la recepción
        const encuadrar = () => {
            distancia = Math.max(1.1, 2.1 / Math.max(camera.aspect, 0.5))
        }

        // ── Luces ──
        scene.add(new THREE.HemisphereLight(oscuro ? 0x9fb4cc : 0xffffff, oscuro ? 0x141b24 : 0xcfd9e3, oscuro ? 0.55 : 0.75))
        const sol = new THREE.DirectionalLight(oscuro ? 0xcfe0ff : 0xfff2e0, oscuro ? 1.3 : 2.2)
        sol.position.set(6, 11, 5)
        sol.castShadow = true
        sol.shadow.mapSize.set(2048, 2048)
        sol.shadow.camera.left = -10
        sol.shadow.camera.right = 10
        sol.shadow.camera.top = 10
        sol.shadow.camera.bottom = -10
        sol.shadow.bias = -0.0005
        sol.shadow.normalBias = 0.02
        sol.shadow.radius = 6
        scene.add(sol)
        const relleno = new THREE.DirectionalLight(0x9ec9ff, oscuro ? 0.35 : 0.3)
        relleno.position.set(-8, 6, -4)
        scene.add(relleno)

        // ── Diorama: losa flotante, paredes con zócalo, ventana ──
        const losa = new THREE.Mesh(
            new RoundedBoxGeometry(14.6, 0.7, 10.6, 6, 0.22),
            new THREE.MeshStandardMaterial({ color: oscuro ? 0x2b3645 : 0xf4f6f8, roughness: 0.85, metalness: 0 })
        )
        losa.position.y = -0.35
        losa.receiveShadow = true
        scene.add(losa)
        const piso = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ map: texturaPiso(oscuro), roughness: 0.42, metalness: 0.05 }))
        piso.rotation.x = -Math.PI / 2
        piso.position.y = 0.001
        piso.receiveShadow = true
        scene.add(piso)
        const sombraLosa = sombraSuave()
        sombraLosa.scale.set(20, 14, 1)
        sombraLosa.position.y = -0.9
        scene.add(sombraLosa)

        const paredMat = new THREE.MeshStandardMaterial({ color: oscuro ? 0x33404f : 0xfbfcfd, roughness: 0.92 })
        const zocaloMat = new THREE.MeshStandardMaterial({ color: oscuro ? 0x1f2833 : 0xd8e0e8, roughness: 0.6 })
        const paredFondo = new THREE.Mesh(new RoundedBoxGeometry(14.6, 2.6, 0.3, 3, 0.06), paredMat)
        paredFondo.position.set(0, 1.3, -5.15)
        paredFondo.receiveShadow = true
        paredFondo.castShadow = true
        const zocaloFondo = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.18, 0.34), zocaloMat)
        zocaloFondo.position.set(0, 0.09, -5.15)
        const paredLado = new THREE.Mesh(new RoundedBoxGeometry(0.3, 2.6, 10.6, 3, 0.06), paredMat)
        paredLado.position.set(-7.15, 1.3, 0)
        paredLado.receiveShadow = true
        const zocaloLado = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 10.6), zocaloMat)
        zocaloLado.position.set(-7.15, 0.09, 0)
        scene.add(paredFondo, zocaloFondo, paredLado, zocaloLado)

        // Ventana en la pared lateral, con luz entrando
        const marco = new THREE.Mesh(new RoundedBoxGeometry(0.12, 1.5, 3.2, 2, 0.04), new THREE.MeshStandardMaterial({ color: oscuro ? 0x0f141b : 0xffffff, roughness: 0.4 }))
        marco.position.set(-7.0, 1.55, 1.2)
        const ventana = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.25), new THREE.MeshStandardMaterial({ color: oscuro ? 0x1a2a44 : 0xbfe3ff, emissive: oscuro ? 0x1a2a44 : 0xa9d8ff, emissiveIntensity: oscuro ? 0.6 : 0.9, roughness: 0.1 }))
        ventana.rotation.y = Math.PI / 2
        ventana.position.set(-6.93, 1.55, 1.2)
        scene.add(marco, ventana)

        // Cartel con la marca en la pared del fondo
        // Panel de marca montado en la pared del fondo
        const panelTex = (() => {
            const c = document.createElement('canvas')
            c.width = 640
            c.height = 220
            const g = c.getContext('2d')!
            g.fillStyle = '#0B0F14'
            g.fillRect(0, 0, 640, 220)
            g.fillStyle = '#6FC043'
            g.fillRect(0, 0, 14, 220)
            g.fillStyle = '#ffffff'
            g.font = '800 72px Inter, system-ui, sans-serif'
            g.textBaseline = 'middle'
            g.fillText('JAM Tech', 56, 92)
            g.fillStyle = '#9fb4cc'
            g.font = '500 30px Inter, system-ui, sans-serif'
            g.fillText('Oficina · equipo de IA', 58, 160)
            const t = new THREE.CanvasTexture(c)
            t.colorSpace = THREE.SRGBColorSpace
            t.anisotropy = 8
            return t
        })()
        const panel = new THREE.Mesh(new RoundedBoxGeometry(3.3, 1.14, 0.1, 2, 0.04), new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.5 }))
        panel.position.set(2.2, 1.65, -4.95)
        panel.castShadow = true
        const panelCara = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1), new THREE.MeshBasicMaterial({ map: panelTex, toneMapped: false }))
        panelCara.position.set(2.2, 1.65, -4.895)
        scene.add(panel, panelCara)

        // Pizarra con notas de colores y estantería con libros, para que la oficina se sienta habitada
        const pizarra = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.3, 0.08, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }))
        pizarra.position.set(5.6, 1.55, -4.96)
        pizarra.castShadow = true
        scene.add(pizarra)
        const notas = ['#ffd166', '#6FC043', '#4BBFD0', '#ff8fa3', '#ffd166']
        notas.forEach((col, i) => {
            const n = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }))
            n.position.set(4.7 + (i % 3) * 0.55 + (i > 2 ? 0.3 : 0), 1.85 - Math.floor(i / 3) * 0.5, -4.91)
            n.rotation.z = (i % 2 ? -1 : 1) * 0.06
            scene.add(n)
        })
        const estante = new THREE.Group()
        const estMat = new THREE.MeshStandardMaterial({ color: oscuro ? 0x9c7554 : 0xd9b48c, roughness: 0.6 })
        for (let i = 0; i < 3; i++) {
            const tabla = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.06, 0.4, 2, 0.02), estMat)
            tabla.position.set(0, 0.45 + i * 0.6, 0)
            tabla.castShadow = true
            estante.add(tabla)
            const libros = ['#1B6CA8', '#6FC043', '#4BBFD0', '#F2A93B', '#2A313A', '#ff8fa3']
            for (let j = 0; j < 6; j++) {
                const libro = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34 + ((i + j) % 3) * 0.05, 0.26), new THREE.MeshStandardMaterial({ color: libros[(i + j) % 6], roughness: 0.7 }))
                libro.position.set(-0.95 + j * 0.2 + (i % 2) * 0.05, 0.45 + i * 0.6 + 0.2, 0)
                libro.castShadow = true
                estante.add(libro)
            }
        }
        for (const dx of [-1.08, 1.08]) {
            const lateral = new THREE.Mesh(new RoundedBoxGeometry(0.06, 1.9, 0.4, 2, 0.02), estMat)
            lateral.position.set(dx, 0.95, 0)
            estante.add(lateral)
        }
        estante.position.set(-4.2, 0, -4.75)
        scene.add(estante)

        // ── Recepción: mostrador de Jami con alfombra ──
        const alfombra = new THREE.Mesh(new RoundedBoxGeometry(6.2, 0.04, 2.6, 2, 0.02), new THREE.MeshStandardMaterial({ color: oscuro ? 0x1b6ca8 : 0x4bbfd0, roughness: 0.95 }))
        alfombra.position.set(0, 0.02, 3.9)
        alfombra.receiveShadow = true
        const mostrador = new THREE.Mesh(new RoundedBoxGeometry(4.6, 1.0, 0.9, 4, 0.16), new THREE.MeshPhysicalMaterial({ color: 0x1b6ca8, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }))
        mostrador.position.set(0, 0.5, 4.1)
        mostrador.castShadow = true
        mostrador.receiveShadow = true
        const tapa = new THREE.Mesh(new RoundedBoxGeometry(4.8, 0.08, 1.05, 2, 0.03), new THREE.MeshStandardMaterial({ color: oscuro ? 0xcfd8e3 : 0xffffff, roughness: 0.3 }))
        tapa.position.set(0, 1.02, 4.1)
        tapa.castShadow = true
        scene.add(alfombra, mostrador, tapa)
        const jami = etiqueta('Jami · Recepción', { color: '#0B0F14', fondo: '#ffffff', punto: '#1B6CA8', ancho: 520, alto: 110 })
        jami.scale.set(2.5, 0.53, 1)
        jami.position.set(0, 1.55, 4.1)
        scene.add(jami)

        // ── Plantas: macetas con copa de esferas ──
        const planta = (x: number, z: number, alto = 1) => {
            const g = new THREE.Group()
            const maceta = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 20), new THREE.MeshStandardMaterial({ color: oscuro ? 0x8a8f96 : 0xe9ecef, roughness: 0.5 }))
            maceta.position.y = 0.25
            maceta.castShadow = true
            g.add(maceta)
            const hojaMat = new THREE.MeshStandardMaterial({ color: 0x4e9a2b, roughness: 0.7 })
            const hojaMat2 = new THREE.MeshStandardMaterial({ color: 0x6fc043, roughness: 0.7 })
            for (let i = 0; i < 7; i++) {
                const h = new THREE.Mesh(new THREE.SphereGeometry(0.22 + ((i * 7919) % 12) / 100, 12, 12), i % 2 ? hojaMat : hojaMat2)
                const a = (i / 7) * Math.PI * 2
                h.position.set(Math.cos(a) * 0.2, 0.75 + alto * 0.35 + Math.sin(i * 1.7) * 0.18, Math.sin(a) * 0.2)
                h.castShadow = true
                g.add(h)
            }
            g.position.set(x, 0, z)
            scene.add(g)
        }
        planta(-6.2, -4.2, 1.2)
        planta(6.3, -4.3, 1)
        planta(6.3, 4.3, 0.8)

        // ── Escritorios y personajes ──
        const personajes = new Map<Departamento, Personaje>()
        const clicables: THREE.Object3D[] = []
        const maderaMat = new THREE.MeshPhysicalMaterial({ color: oscuro ? 0x9c7554 : 0xd9b48c, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 })
        const metalMat = new THREE.MeshStandardMaterial({ color: oscuro ? 0x3a434f : 0xeef2f6, roughness: 0.35, metalness: 0.6 })
        const negroMat = new THREE.MeshStandardMaterial({ color: 0x1b2129, roughness: 0.4, metalness: 0.3 })
        const sillaMat = new THREE.MeshStandardMaterial({ color: oscuro ? 0x2a313a : 0x2f3741, roughness: 0.6 })

        for (const dep of DEPS) {
            const info = DEPARTAMENTOS[dep]
            const { pos, piel, pelo } = PUESTOS[dep]
            const [x, z] = pos
            const grupo = new THREE.Group()
            grupo.position.set(x, 0, z)
            grupo.userData.dep = dep

            // Mesa con tapa redondeada y dos patas metálicas
            const mesa = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.1, 1.15, 3, 0.04), maderaMat)
            mesa.position.y = 0.78
            mesa.castShadow = true
            mesa.receiveShadow = true
            grupo.add(mesa)
            for (const dx of [-1.05, 1.05]) {
                const pata = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.74, 1.0, 2, 0.03), metalMat)
                pata.position.set(dx, 0.37, 0)
                pata.castShadow = true
                grupo.add(pata)
            }

            // Monitor con bisel fino y pantalla "viva"
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.03, 20), negroMat)
            base.position.set(0, 0.85, -0.3)
            const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 10), negroMat)
            mastil.position.set(0, 0.98, -0.3)
            const bisel = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.62, 0.05, 2, 0.02), negroMat)
            bisel.position.set(0, 1.35, -0.3)
            bisel.castShadow = true
            const pc = document.createElement('canvas')
            pc.width = 256
            pc.height = 160
            const pctx = pc.getContext('2d')!
            const pantalla = new THREE.CanvasTexture(pc)
            pantalla.colorSpace = THREE.SRGBColorSpace
            const pantallaMat = new THREE.MeshStandardMaterial({ map: pantalla, emissive: 0xffffff, emissiveMap: pantalla, emissiveIntensity: 0.9, roughness: 0.2 })
            const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.54), pantallaMat)
            vidrio.position.set(0, 1.35, -0.272)
            grupo.add(base, mastil, bisel, vidrio)
            // Luz suave de la pantalla sobre el escritorio
            const luz = new THREE.PointLight(new THREE.Color(info.color), 0, 2.2, 2)
            luz.position.set(0, 1.25, 0.1)
            grupo.add(luz)

            // Teclado, mouse y taza
            const teclado = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.03, 0.2, 2, 0.01), new THREE.MeshStandardMaterial({ color: oscuro ? 0xdfe5ec : 0xf7f9fb, roughness: 0.5 }))
            teclado.position.set(-0.05, 0.85, 0.15)
            teclado.castShadow = true
            const mouse = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.04, 0.16, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0xf7f9fb, roughness: 0.4 }))
            mouse.position.set(0.42, 0.85, 0.15)
            const taza = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 16), new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.3 }))
            taza.position.set(-0.95, 0.9, 0.05)
            taza.castShadow = true
            grupo.add(teclado, mouse, taza)

            // Silla con respaldo
            const asiento = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.1, 0.6, 2, 0.04), sillaMat)
            asiento.position.set(0, 0.48, 0.78)
            asiento.castShadow = true
            const respaldo = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.72, 0.1, 2, 0.04), sillaMat)
            respaldo.position.set(0, 0.88, 1.06)
            respaldo.castShadow = true
            const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 10), metalMat)
            pie.position.set(0, 0.22, 0.78)
            const ruedas = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 5), metalMat)
            ruedas.position.set(0, 0.03, 0.78)
            grupo.add(asiento, respaldo, pie, ruedas)

            // Personaje: cuerpo, cabeza con pelo y ojos, brazos
            const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 8, 16), new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.75 }))
            cuerpo.position.set(0, 0.9, 0.72)
            cuerpo.castShadow = true
            const cabeza = new THREE.Group()
            const cara = new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 24), new THREE.MeshStandardMaterial({ color: piel, roughness: 0.6 }))
            cara.castShadow = true
            const cabello = new THREE.Mesh(new THREE.SphereGeometry(0.225, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: pelo, roughness: 0.8 }))
            cabello.position.y = 0.01
            const ojoMat = new THREE.MeshStandardMaterial({ color: 0x1b2129 })
            for (const dx of [-0.07, 0.07]) {
                const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), ojoMat)
                ojo.position.set(dx, 0.02, -0.19)
                cabeza.add(ojo)
            }
            cabeza.add(cara, cabello)
            cabeza.position.set(0, 1.48, 0.72)
            const brazoGeo = new THREE.CapsuleGeometry(0.065, 0.3, 4, 10)
            const brazoMat = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.75 })
            const brazos = [-0.25, 0.25].map((dx) => {
                const b = new THREE.Mesh(brazoGeo, brazoMat)
                b.position.set(dx, 0.98, 0.42)
                b.rotation.x = Math.PI / 2.1
                b.castShadow = true
                return b
            })
            grupo.add(cuerpo, cabeza, ...brazos)

            // Indicadores de estado
            const aviso = etiqueta('✋ Espera tu OK', { color: '#0B0F14', fondo: '#ffd166', ancho: 440, alto: 110, peso: 700 })
            aviso.scale.set(2.0, 0.5, 1)
            aviso.position.set(0, 2.45, 0.72)
            aviso.visible = false
            const tecleando = etiqueta('escribiendo…', { color: '#ffffff', fondo: info.color, ancho: 360, alto: 100 })
            tecleando.scale.set(1.45, 0.4, 1)
            tecleando.position.set(0, 2.2, 0.72)
            tecleando.visible = false
            const anillo = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
            anillo.rotation.x = -Math.PI / 2
            anillo.position.set(0, 0.012, 0.78)
            const nombre = etiqueta(`${info.emoji} ${info.nombre}`, { color: oscuro ? '#ffffff' : '#0B0F14', fondo: oscuro ? '#243040' : '#ffffff', punto: info.color, ancho: 440, alto: 110 })
            nombre.scale.set(2.3, 0.58, 1)
            // A la izquierda del monitor, para que los avisos (centrados sobre el personaje) no lo tapen
            nombre.position.set(-1.15, 1.95, -0.3)
            grupo.add(aviso, tecleando, anillo, nombre)

            scene.add(grupo)
            clicables.push(grupo)
            personajes.set(dep, { grupo, cuerpo, cabeza, brazos, pantalla, pantallaCtx: pctx, luz, aviso, teclado: tecleando, anillo, color: info.color, ultimoDibujo: 0 })
        }

        /** Dibuja lo que se ve en el monitor según el estado (gráfica viva, logo en reposo, alerta). */
        const dibujarPantalla = (p: Personaje, estado: EstadoDepartamento, t: number) => {
            const g = p.pantallaCtx
            const W = 256, H = 160
            g.fillStyle = estado === 'libre' ? '#0f1620' : '#0b0f14'
            g.fillRect(0, 0, W, H)
            g.textAlign = 'left'
            if (estado === 'trabajando') {
                g.fillStyle = 'rgba(255,255,255,0.08)'
                for (let i = 0; i < 4; i++) g.fillRect(16, 24 + i * 30, 90 + Math.sin(t * 2 + i) * 20 + 40, 8)
                g.fillStyle = p.color
                for (let i = 0; i < 7; i++) {
                    const h = 20 + Math.abs(Math.sin(t * 1.5 + i * 0.9)) * 70
                    g.fillRect(130 + i * 16, H - 20 - h, 10, h)
                }
                g.fillStyle = 'rgba(255,255,255,0.9)'
                g.font = '600 12px Inter, system-ui, sans-serif'
                g.fillText('trabajando', 16, 16)
            } else if (estado === 'esperando') {
                g.fillStyle = '#ffd166'
                g.font = '700 54px Inter, system-ui, sans-serif'
                g.textAlign = 'center'
                g.fillText('!', W / 2, 96)
                g.textAlign = 'left'
                g.font = '600 12px Inter, system-ui, sans-serif'
                g.fillText('esperando tu confirmación', 16, 140)
            } else {
                g.fillStyle = 'rgba(255,255,255,0.35)'
                g.font = '700 26px Inter, system-ui, sans-serif'
                g.textAlign = 'center'
                g.fillText('JAM Tech', W / 2, H / 2 + 8)
            }
            p.pantalla.needsUpdate = true
        }

        // ── Tamaño, clic y hover ──
        const ajustar = () => {
            const w = el.clientWidth
            const h = el.clientHeight
            renderer.setSize(w, h)
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            encuadrar()
        }
        ajustar()
        const ro = new ResizeObserver(ajustar)
        ro.observe(el)

        const raycaster = new THREE.Raycaster()
        const puntero = new THREE.Vector2()
        let hover: Departamento | null = null
        const depBajoPuntero = (ev: MouseEvent): Departamento | null => {
            const r = renderer.domElement.getBoundingClientRect()
            puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
            raycaster.setFromCamera(puntero, camera)
            let o: THREE.Object3D | null = raycaster.intersectObjects(clicables, true)[0]?.object ?? null
            while (o && !o.userData.dep) o = o.parent
            return (o?.userData.dep as Departamento) ?? null
        }
        const onClick = (ev: MouseEvent) => {
            const dep = depBajoPuntero(ev)
            if (dep) onSelectRef.current(dep)
        }
        const onMove = (ev: MouseEvent) => {
            hover = depBajoPuntero(ev)
            renderer.domElement.style.cursor = hover ? 'pointer' : 'default'
        }
        const onLeave = () => { hover = null }
        renderer.domElement.addEventListener('click', onClick)
        renderer.domElement.addEventListener('mousemove', onMove)
        renderer.domElement.addEventListener('mouseleave', onLeave)

        // ── Animación ──
        let raf = 0
        const t0 = performance.now()
        const escalaObjetivo = new THREE.Vector3()
        const animar = () => {
            const t = (performance.now() - t0) / 1000
            // La cámara respira muy despacio alrededor de la oficina
            const giro = reducir ? 0 : Math.sin(t * 0.12) * 0.05
            const r = 19 * distancia
            camera.position.set(Math.sin(0.78 + giro) * r, 15.5 * distancia, Math.cos(0.78 + giro) * r)
            camera.lookAt(mira)

            for (const dep of DEPS) {
                const p = personajes.get(dep)!
                const estado = estadosRef.current[dep] ?? 'libre'
                const fase = t * 2 + DEPS.indexOf(dep) * 1.3
                const respira = reducir ? 0 : Math.sin(fase * 0.8) * 0.012
                p.cuerpo.scale.set(1, 1 + respira, 1)
                p.cabeza.position.y = 1.48 + respira * 1.5
                const e = hover === dep ? 1.04 : 1
                p.grupo.scale.lerp(escalaObjetivo.set(e, e, e), 0.15)
                const anilloMat = p.anillo.material as THREE.MeshBasicMaterial

                if (estado === 'trabajando') {
                    const tecleo = reducir ? 0 : Math.sin(fase * 9)
                    p.brazos[0].position.y = 0.98 + tecleo * 0.03
                    p.brazos[1].position.y = 0.98 - tecleo * 0.03
                    p.brazos[1].rotation.x = Math.PI / 2.1
                    p.cabeza.rotation.set(-0.22 + (reducir ? 0 : Math.sin(fase * 0.7) * 0.03), 0, 0)
                    p.teclado.visible = true
                    p.aviso.visible = false
                    p.luz.intensity = 0.9 + (reducir ? 0 : Math.sin(fase * 3) * 0.15)
                    anilloMat.opacity = 0
                } else if (estado === 'esperando') {
                    p.brazos[0].position.y = 0.98
                    p.brazos[1].position.y = 1.4 // mano levantada
                    p.brazos[1].rotation.x = Math.PI / 1.05
                    p.cabeza.rotation.set(0.08, 0, 0)
                    p.aviso.visible = true
                    p.aviso.position.y = 2.45 + (reducir ? 0 : Math.sin(fase * 2) * 0.06)
                    p.teclado.visible = false
                    p.luz.intensity = 0.5
                    const pulso = reducir ? 0.5 : (Math.sin(fase * 2.5) + 1) / 2
                    anilloMat.opacity = 0.25 + pulso * 0.45
                    p.anillo.scale.setScalar(1 + pulso * 0.12)
                } else {
                    p.brazos[0].position.y = p.brazos[1].position.y = 0.98
                    p.brazos[1].rotation.x = Math.PI / 2.1
                    p.cabeza.rotation.set(reducir ? 0 : Math.sin(fase * 0.5) * 0.08, reducir ? 0 : Math.sin(fase * 0.3) * 0.15, 0)
                    p.teclado.visible = false
                    p.aviso.visible = false
                    p.luz.intensity = 0.15
                    anilloMat.opacity = 0
                }
                // La pantalla se redibuja unas 8 veces por segundo (basta y no cuesta)
                if (t - p.ultimoDibujo > 0.12) {
                    dibujarPantalla(p, estado, t)
                    p.ultimoDibujo = t
                }
            }
            renderer.render(scene, camera)
            raf = requestAnimationFrame(animar)
        }
        animar()

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            renderer.domElement.removeEventListener('click', onClick)
            renderer.domElement.removeEventListener('mousemove', onMove)
            renderer.domElement.removeEventListener('mouseleave', onLeave)
            scene.traverse((o) => {
                if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
                    o.geometry?.dispose()
                    const m = o.material as THREE.Material | THREE.Material[]
                    ;(Array.isArray(m) ? m : [m]).forEach((x) => {
                        const map = (x as THREE.MeshStandardMaterial).map
                        if (map) map.dispose()
                        x.dispose()
                    })
                }
            })
            pmrem.dispose()
            renderer.dispose()
            el.removeChild(renderer.domElement)
        }
    }, [oscuro])

    return <div ref={ref} className={className} aria-label="Oficina de JAM Tech en 3D" role="img" />
}
