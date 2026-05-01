import Sidebar from './Sidebar'
import TabBar from './TabBar'
import NavArrowOverlay from './NavArrowOverlay'
import { TabProvider, useTabs } from '../context/TabContext'

function DuplicateTabModal() {
  const { confirmDuplicate, confirmOpenDuplicate, dismissDuplicate } = useTabs()
  if (!confirmDuplicate) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Scheda già aperta</h3>
        <p className="text-sm text-gray-600 mb-5">La scheda è già aperta, vuoi aprirne una nuova?</p>
        <div className="flex justify-end gap-3">
          <button onClick={dismissDuplicate}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            No
          </button>
          <button onClick={confirmOpenDuplicate}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Sì, apri nuova
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  return (
    <TabProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden" id="contenuto-principale">
          <TabBar />
        </main>
      </div>
      <DuplicateTabModal />
      <NavArrowOverlay />
    </TabProvider>
  )
}
