import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Puerta de entrada: toda ruta exige sesión salvo el login y los endpoints
 * que ya se protegen con su propio secreto (webhook de Telegram, cron).
 * También refresca la cookie de sesión en cada petición, que es lo que
 * mantiene al usuario dentro sin tener que volver a entrar cada hora.
 */
const PUBLIC_PREFIXES = ['/login', '/api/telegram', '/api/cron']

export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request })

    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet) => {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                response = NextResponse.next({ request })
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
            },
        },
    })

    // getUser() valida el token contra Supabase; getSession() solo leería la
    // cookie y se la podría fabricar cualquiera.
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname
    const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))

    if (!user && !isPublic) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.search = ''
        if (path !== '/') url.searchParams.set('next', path)
        // Las llamadas de API sin sesión reciben 401, no una redirección HTML.
        if (path.startsWith('/api/')) {
            return NextResponse.json({ ok: false, error: 'Sesión requerida' }, { status: 401 })
        }
        return NextResponse.redirect(url)
    }

    if (user && path === '/login') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.search = ''
        return NextResponse.redirect(url)
    }

    return response
}

export const config = {
    // Todo salvo estáticos de Next y archivos con extensión (imágenes, iconos, marca).
    matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
}
