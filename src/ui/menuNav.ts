/**
 * Arrow-key navigation shared by every menu screen.
 * Elements opt in with data-nav. Elements inside one data-nav-row form a horizontal group:
 * up and down move between groups, left and right move inside a group. Enter is left to the browser,
 * which turns it into a real click on the focused button, so gesture-gated APIs keep working.
 */

function targets(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-nav]')).filter(
    (node) => !node.closest('[hidden]') && !(node as HTMLButtonElement).disabled,
  );
}

function rowOf(node: HTMLElement): Element {
  return node.closest('[data-nav-row]') ?? node;
}

/** The element a group presents when focus enters it: its selected option when it has one. */
function entryPoint(group: HTMLElement[]): HTMLElement | undefined {
  return group.find((node) => node.getAttribute('aria-checked') === 'true' || node.getAttribute('aria-selected') === 'true') ?? group[0];
}

function groupsOf(nodes: HTMLElement[]): HTMLElement[][] {
  const groups: HTMLElement[][] = [];
  let currentRow: Element | null = null;
  for (const node of nodes) {
    const row = rowOf(node);
    if (row !== currentRow) {
      groups.push([]);
      currentRow = row;
    }
    groups[groups.length - 1]?.push(node);
  }
  return groups;
}

export function firstNavTarget(root: HTMLElement): HTMLElement | null {
  const groups = groupsOf(targets(root));
  const first = groups[0];
  return first ? (entryPoint(first) ?? null) : null;
}

/** Handles one key. Returns true when focus moved, so the caller can play the move sound. */
export function handleNavKey(root: HTMLElement, event: KeyboardEvent): boolean {
  const { key } = event;
  const vertical = key === 'ArrowUp' || key === 'ArrowDown';
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  if (!vertical && !horizontal && key !== 'Enter') return false;

  const nodes = targets(root);
  const active = document.activeElement as HTMLElement | null;
  if (!active || !nodes.includes(active)) {
    // Focus was lost, for instance to a click on empty space. Any navigation key brings it back.
    if (key === 'Enter' && active && root.contains(active) && active.tagName === 'BUTTON') return false;
    event.preventDefault();
    const entry = firstNavTarget(root);
    entry?.focus();
    return entry !== null;
  }
  if (key === 'Enter') return false;

  const groups = groupsOf(nodes);
  const groupIndex = groups.findIndex((group) => group.includes(active));
  const group = groups[groupIndex];
  if (!group) return false;

  if (vertical) {
    event.preventDefault();
    const step = key === 'ArrowDown' ? 1 : -1;
    const next = groups[(groupIndex + step + groups.length) % groups.length];
    const target = next ? entryPoint(next) : undefined;
    if (!target || target === active) return false;
    target.focus();
    return true;
  }

  // Left and right belong to a slider while it has focus, so it adjusts natively.
  if (active instanceof HTMLInputElement && active.type === 'range') return false;
  if (group.length < 2) return false;
  event.preventDefault();
  const step = key === 'ArrowRight' ? 1 : -1;
  const target = group[(group.indexOf(active) + step + group.length) % group.length];
  target?.focus();
  return target !== undefined;
}
