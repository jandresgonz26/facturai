'use client'

/**
 * La oficina en 3D: un escritorio por departamento y un personaje que se mueve
 * según lo que ese departamento está haciendo (libre, trabajando o esperando
 * una confirmación). Al tocar un personaje se abre el chat con ese departamento.
 * Solo dibuja; el estado llega por props desde la página.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import type { EstadoDepartamento } from '@/lib/agent/eventos'

export type EstadoDeps = Record<Departamento, EstadoDepartamento>

interface Props {
    estados: EstadoDeps
    onSelect: (dep: Departamento) => void
    className?: string
}

const DEPS = Object.keys(DEPARTAMENTOS) as Departamento[]
/** Posición de cada escritorio en el piso (x, z). */
const PUESTOS: Record<Departamento, [number, number]> = {
    ventas: [-3.2, -1.6],
    finanzas: [3.2, -1.6],
    operaciones: [-3.2, 2.2],
    marketing: [3.2, 2.2],
}

interface Personaje {
    grupo: THREE.Group
    cuerpo: THREE.Mesh
    cabeza: THREE.Mesh
    pantalla: THREE.MeshStandardMaterial
    aviso: THREE.Sprite
    teclado: THREE.Sprite
    brazos: THREE.Mesh[]
}

function etiqueta(texto: string, color: string, fondo: string): THREE.Sprite {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 128
    const g = c.getContext('2d')!
    g.fillStyle = fondo
    g.beginPath()
    g.roundRect(8, 8, 496, 112, 56)
    g.fill()
    g.fillStyle = color
    g.font = '600 52px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(texto, 256, 66)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    s.scale.set(2.4, 0.6, 1)
    return s
}

export default function Oficina3D({ estados, onSelect, className }: Props) {
    const ref = useRef<HTMLDivElement>(null)
    const estadosRef = useRef(estados)
    const onSelectRef = useRef(onSelect)
    // Las props cambian cada 5 s; la escena las lee desde refs para no reconstruirse.
    useEffect(() => { estadosRef.current = estados }, [estados])
    useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const oscuro = document.documentElement.classList.contains('dark')
        const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
        // Vista isométrica desde la esquina delantera derecha; se aleja en pantallas estrechas para que quepan los cuatro escritorios.
        const encuadrar = () => {
            const k = Math.max(1, 1.7 / Math.max(camera.aspect, 0.5))
            camera.position.set(10 * k, 10.5 * k, 12 * k)
            camera.lookAt(0, 0.3, 0)
        }

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        el.appendChild(renderer.domElement)

        // Luz: una ambiental suave y un "sol" que proyecta sombras cortas
        scene.add(new THREE.HemisphereLight(0xffffff, oscuro ? 0x1a2230 : 0xd9e2ec, oscuro ? 0.9 : 1.1))
        const sol = new THREE.DirectionalLight(0xffffff, oscuro ? 1.2 : 1.6)
        sol.position.set(5, 10, 4)
        sol.castShadow = true
        sol.shadow.mapSize.set(2048, 2048)
        sol.shadow.camera.left = -9
        sol.shadow.camera.right = 9
        sol.shadow.camera.top = 9
        sol.shadow.camera.bottom = -9
        scene.add(sol)

        // Piso con baldosas, y dos paredes bajas al fondo
        const pisoTex = (() => {
            const c = document.createElement('canvas')
            c.width = c.height = 256
            const g = c.getContext('2d')!
            g.fillStyle = oscuro ? '#1b2330' : '#dfe8f0'
            g.fillRect(0, 0, 256, 256)
            g.fillStyle = oscuro ? '#222c3a' : '#cfdbe6'
            g.fillRect(0, 0, 128, 128)
            g.fillRect(128, 128, 128, 128)
            const t = new THREE.CanvasTexture(c)
            t.wrapS = t.wrapT = THREE.RepeatWrapping
            t.repeat.set(7, 5)
            t.colorSpace = THREE.SRGBColorSpace
            return t
        })()
        const piso = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ map: pisoTex, roughness: 0.95 }))
        piso.rotation.x = -Math.PI / 2
        piso.receiveShadow = true
        scene.add(piso)
        const paredMat = new THREE.MeshStandardMaterial({ color: oscuro ? 0x2a3444 : 0xf2f5f8, roughness: 0.9 })
        const paredFondo = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 0.2), paredMat)
        paredFondo.position.set(0, 1.1, -5.1)
        paredFondo.receiveShadow = true
        scene.add(paredFondo)
        const paredLado = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 10), paredMat)
        paredLado.position.set(-7.1, 1.1, 0)
        scene.add(paredLado)
        const letrero = etiqueta('JAM Tech · Oficina', '#ffffff', '#0B0F14')
        letrero.scale.set(3.6, 0.9, 1)
        letrero.position.set(0, 1.9, -4.95)
        scene.add(letrero)

        // Recepción: el mostrador de Jami al frente
        const mostrador = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x1b6ca8, roughness: 0.6 }))
        mostrador.position.set(0, 0.45, 4.1)
        mostrador.castShadow = true
        scene.add(mostrador)
        const jami = etiqueta('Jami · Recepción', '#0B0F14', '#ffffff')
        jami.position.set(0, 1.45, 4.1)
        scene.add(jami)

        // Plantas
        for (const [x, z] of [[-6.2, -4.2], [6.2, -4.2]] as [number, number][]) {
            const maceta = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x9a6b4f }))
            maceta.position.set(x, 0.25, z)
            maceta.castShadow = true
            const hojas = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0x4e9a2b }))
            hojas.position.set(x, 1.1, z)
            hojas.castShadow = true
            scene.add(maceta, hojas)
        }

        // Un escritorio por departamento
        const personajes = new Map<Departamento, Personaje>()
        const clicables: THREE.Object3D[] = []
        for (const dep of DEPS) {
            const info = DEPARTAMENTOS[dep]
            const [x, z] = PUESTOS[dep]
            const grupo = new THREE.Group()
            grupo.position.set(x, 0, z)
            grupo.userData.dep = dep

            const mesa = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: oscuro ? 0x8a6a4a : 0xc9a27a, roughness: 0.7 }))
            mesa.position.y = 0.78
            mesa.castShadow = true
            mesa.receiveShadow = true
            const patas = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: oscuro ? 0x3a3f48 : 0xe9eef3 }))
            patas.position.y = 0.37
            const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), new THREE.MeshStandardMaterial({ color: 0x1f2630 }))
            monitor.position.set(0, 1.2, -0.3)
            monitor.castShadow = true
            const pantalla = new THREE.MeshStandardMaterial({ color: info.color, emissive: new THREE.Color(info.color), emissiveIntensity: 0.15 })
            const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), pantalla)
            vidrio.position.set(0, 1.2, -0.265)
            const silla = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a313a }))
            silla.position.set(0, 0.45, 0.75)
            const respaldo = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a313a }))
            respaldo.position.set(0, 0.85, 1.05)

            // Personaje: cuerpo, cabeza y dos brazos que "teclean"
            const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.45, 6, 12), new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.8 }))
            cuerpo.position.set(0, 0.85, 0.72)
            cuerpo.castShadow = true
            const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshStandardMaterial({ color: 0xf1c9a5 }))
            cabeza.position.set(0, 1.42, 0.72)
            cabeza.castShadow = true
            const brazoGeo = new THREE.CapsuleGeometry(0.06, 0.3, 4, 8)
            const brazoMat = new THREE.MeshStandardMaterial({ color: info.color })
            const brazos = [-0.22, 0.22].map((dx) => {
                const b = new THREE.Mesh(brazoGeo, brazoMat)
                b.position.set(dx, 0.95, 0.45)
                b.rotation.x = Math.PI / 2.2
                return b
            })
            const aviso = etiqueta('!  Esperando tu OK', '#0B0F14', '#ffd166')
            aviso.position.set(0, 2.05, 0.72)
            aviso.visible = false
            const teclado = etiqueta('escribiendo…', '#ffffff', info.color)
            teclado.scale.set(1.6, 0.4, 1)
            teclado.position.set(0, 1.85, 0.72)
            teclado.visible = false
            const nombre = etiqueta(`${info.emoji} ${info.nombre}`, oscuro ? '#ffffff' : '#0B0F14', oscuro ? '#2a3444' : '#ffffff')
            nombre.position.set(0, 1.65, -0.35)

            grupo.add(mesa, patas, monitor, vidrio, silla, respaldo, cuerpo, cabeza, ...brazos, aviso, teclado, nombre)
            scene.add(grupo)
            clicables.push(grupo)
            personajes.set(dep, { grupo, cuerpo, cabeza, pantalla, aviso, teclado, brazos })
        }

        // Tamaño y clic
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
        const onClick = (ev: MouseEvent) => {
            const r = renderer.domElement.getBoundingClientRect()
            puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
            raycaster.setFromCamera(puntero, camera)
            const hit = raycaster.intersectObjects(clicables, true)[0]
            let o: THREE.Object3D | null = hit?.object ?? null
            while (o && !o.userData.dep) o = o.parent
            if (o?.userData.dep) onSelectRef.current(o.userData.dep as Departamento)
        }
        const onMove = (ev: MouseEvent) => {
            const r = renderer.domElement.getBoundingClientRect()
            puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
            raycaster.setFromCamera(puntero, camera)
            renderer.domElement.style.cursor = raycaster.intersectObjects(clicables, true).length ? 'pointer' : 'default'
        }
        renderer.domElement.addEventListener('click', onClick)
        renderer.domElement.addEventListener('mousemove', onMove)

        // Animación: cada personaje según el estado de su departamento
        let raf = 0
        const t0 = performance.now()
        const animar = () => {
            const t = (performance.now() - t0) / 1000
            for (const dep of DEPS) {
                const p = personajes.get(dep)!
                const estado = estadosRef.current[dep] ?? 'libre'
                const fase = t * 2 + DEPS.indexOf(dep)
                const respira = reducir ? 0 : Math.sin(fase * 0.8) * 0.01
                p.cuerpo.scale.y = 1 + respira
                p.cabeza.position.y = 1.42 + respira * 2
                if (estado === 'trabajando') {
                    const tecleo = reducir ? 0 : Math.sin(fase * 9)
                    p.brazos[0].position.y = 0.95 + tecleo * 0.03
                    p.brazos[1].position.y = 0.95 - tecleo * 0.03
                    p.cabeza.rotation.x = -0.25
                    p.pantalla.emissiveIntensity = 0.7 + (reducir ? 0 : Math.sin(fase * 3) * 0.2)
                    p.teclado.visible = true
                    p.aviso.visible = false
                } else if (estado === 'esperando') {
                    p.brazos[0].position.y = 0.95
                    p.brazos[1].position.y = 1.35 // mano levantada
                    p.cabeza.rotation.x = 0.1
                    p.pantalla.emissiveIntensity = 0.5
                    p.aviso.visible = true
                    p.aviso.position.y = 2.05 + (reducir ? 0 : Math.sin(fase * 2) * 0.06)
                    p.teclado.visible = false
                } else {
                    p.brazos[0].position.y = p.brazos[1].position.y = 0.95
                    p.cabeza.rotation.x = reducir ? 0 : Math.sin(fase * 0.5) * 0.08
                    p.pantalla.emissiveIntensity = 0.15
                    p.teclado.visible = false
                    p.aviso.visible = false
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
            renderer.dispose()
            scene.traverse((o) => {
                if (o instanceof THREE.Mesh) {
                    o.geometry.dispose()
                    const m = o.material as THREE.Material | THREE.Material[]
                    ;(Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
                }
            })
            el.removeChild(renderer.domElement)
        }
    }, [])

    return <div ref={ref} className={className} aria-label="Oficina de JAM Tech en 3D" role="img" />
}
