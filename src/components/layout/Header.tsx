'use client'

export function Header() {
    return (
        <header className="sticky top-0 z-20 bg-gray-800 shadow-md px-8 py-4 flex items-center justify-between gap-4 border-b border-gray-700">
            {/* Search */}
            <div className="flex-1 max-w-xl ml-8 lg:ml-0">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-rounded text-gray-500 group-focus-within:text-teal-400 transition-colors">
                            search
                        </span>
                    </div>
                    <input
                        className="block w-full pl-10 pr-3 py-2 border border-gray-700 rounded-lg bg-gray-900 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 shadow-inner transition-all text-sm"
                        placeholder="Buscar transacción, cliente..."
                        type="text"
                    />
                </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-6">
                {/* Notification */}
                <button className="relative p-2 text-gray-400 hover:text-white transition-colors focus:outline-none">
                    <span className="material-symbols-rounded">notifications</span>
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-gray-800"></span>
                </button>

                {/* Divider */}
                <div className="h-8 w-px bg-gray-700 hidden sm:block"></div>

                {/* User */}
                <div className="flex items-center gap-3 cursor-pointer group">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Admin</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Gerencia</p>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-teal-500 to-sky-500 p-[2px] flex-shrink-0">
                        <div className="h-full w-full rounded-full bg-gray-700 flex items-center justify-center">
                            <span className="material-symbols-rounded text-white text-xs">person</span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}
