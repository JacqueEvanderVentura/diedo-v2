import { CartPanel } from './CartPanel'

// Desktop: sticky right sidebar, full content height.
export function CartSidebar() {
  return (
    <aside
      data-testid="pos-cart-sidebar"
      className="hidden h-full w-[360px] shrink-0 border-l border-slate-100 bg-white shadow-cart lg:flex xl:w-[400px]"
    >
      <CartPanel />
    </aside>
  )
}
