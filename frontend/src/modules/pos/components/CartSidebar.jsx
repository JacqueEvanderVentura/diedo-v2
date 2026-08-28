import { CartPanel } from './CartPanel'

// Desktop: sticky right sidebar, full content height.
export function CartSidebar() {
  return (
    <aside
      data-testid="pos-cart-sidebar"
      className="hidden h-full w-[360px] min-w-0 shrink-0 flex-col overflow-hidden border-l border-slate-100 bg-white shadow-cart lg:flex xl:w-[400px]"
    >
      <CartPanel />
    </aside>
  )
}
