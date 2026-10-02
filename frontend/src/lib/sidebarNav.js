export function isNavGroupActive(group, pathname) {
  return group.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))
}

/** Which nav groups should show their children (expanded) in the sidebar. */
export function deriveOpenNavGroups(groups, pathname) {
  const next = {}
  groups.forEach((g) => {
    if (!g.children) return
    if (g.alwaysExpanded || isNavGroupActive(g, pathname)) next[g.id] = true
  })
  return next
}
