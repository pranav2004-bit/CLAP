import { Loader2 } from 'lucide-react'

export default function AdminLoading() {
    return (
        <div className="w-full h-[calc(100vh-64px)] lg:h-screen flex flex-col items-center justify-center bg-gray-50/50">
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-300">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <div className="text-center">
                    <h3 className="text-lg font-bold text-gray-800 tracking-tight">Loading content</h3>
                    <p className="text-sm text-gray-500 mt-1">Please wait while we fetch the latest data...</p>
                </div>
            </div>
        </div>
    )
}
