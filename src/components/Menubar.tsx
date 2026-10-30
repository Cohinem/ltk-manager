import { Menubar as BaseMenubar } from "@base-ui/react/menubar";
import { ListIcon } from "@phosphor-icons/react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { m } from "@/i18n";

import { focusRingInset } from "./focus";
import { Menu } from "./Menu";
import { fittingMenuCount } from "./menubarLayout";

/** One menu of a `Menubar`: its title in the bar and the items of its popup. */
export interface MenubarMenu {
  readonly id: string;
  readonly title: string;
  /** The items, built of `Menu` parts, which also draw as a submenu of the overflow menu. */
  readonly content: ReactNode;
  /** The classes of the popup, such as a width or a scroll height. */
  readonly className?: string;
}

export interface MenubarProps {
  readonly menus: readonly MenubarMenu[];
  readonly "aria-label": string;
  /**
   * The region whose focus Alt and F10 move to the bar. Without it, the keys reach the bar from
   * anywhere in the window.
   */
  readonly keyScope?: RefObject<HTMLElement | null>;
  /** What the bar draws after its titles, such as a status chip. Its width counts as taken. */
  readonly end?: ReactNode;
  readonly "data-ui"?: string;
}

const TITLE =
  "flex h-7 shrink-0 cursor-default items-center rounded-md px-2 text-meta whitespace-nowrap text-surface-300 select-none transition-colors " +
  /* DS-VEIL */ "hover:bg-surface-veil hover:text-surface-100 data-[popup-open]:bg-surface-veil-strong data-[popup-open]:text-surface-50 " +
  focusRingInset;

/** The gap in px between the titles and the `end` content: `gap-1.5`. */
const END_GAP = 6;

/**
 * A row of menu titles, each over a popup of `Menu` items, per the WAI-ARIA menubar pattern.
 *
 * Left and Right move between the titles, Down opens a menu, a letter moves to the next title
 * that starts with it, and Escape closes the menu. While a menu is open, a hover on another title
 * opens that one. Alt alone or F10 moves focus to the first title and back, and Escape on a title
 * returns focus to where the keys moved it from.
 *
 * The bar takes the width that its row leaves it and never pushes a sibling. The titles that do
 * not fit move, from the end, into one overflow menu, where each is a submenu.
 */
export function Menubar({
  menus,
  "aria-label": label,
  keyScope,
  end,
  "data-ui": dataUi,
}: MenubarProps) {
  const box = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const endBox = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const shown = useFittingCount(box, measure, endBox, menus);

  const visible = menus.slice(0, shown);
  const overflow = menus.slice(shown);

  useBarKeys(bar, keyScope, returnTo);

  /* The element that focus came from, outside the bar and its popups, is where a chosen item and
     Escape on a title return it. */
  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    const from = event.relatedTarget;
    if (!(from instanceof HTMLElement) || bar.current?.contains(from)) return;
    if (from.closest("[role='menu']") !== null) return;

    returnTo.current = from;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const triggers = titlesOf(bar.current);
    const target = event.target as HTMLElement;
    if (!triggers.includes(target)) return;

    if (event.key === "Escape" && !target.hasAttribute("data-popup-open")) {
      const back = returnTo.current;
      if (back !== null && back.isConnected) {
        event.preventDefault();
        back.focus();
      }
      return;
    }

    if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;

    const next = nextTitle(triggers, target, event.key);
    if (next !== null) {
      event.preventDefault();
      next.focus();
    }
  }

  return (
    <div
      ref={box}
      data-ui={dataUi ?? "Menubar"}
      className="relative flex min-w-7 flex-1 basis-0 items-center gap-1.5"
    >
      <BaseMenubar
        ref={bar}
        aria-label={label}
        loopFocus
        modal={false}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        className="flex min-w-0 items-center select-none"
      >
        {visible.map((menu) => (
          <BarMenu key={menu.id} returnTo={returnTo} className={menu.className} title={menu.title}>
            {menu.content}
          </BarMenu>
        ))}
        {overflow.length > 0 && (
          <BarMenu
            returnTo={returnTo}
            title={<ListIcon weight="bold" className="size-4" />}
            label={m.common_menubar_overflow_label()}
          >
            {overflow.map((menu) => (
              <Menu.SubmenuRoot key={menu.id}>
                <Menu.SubmenuTrigger>{menu.title}</Menu.SubmenuTrigger>
                <Menu.SubmenuContent className={menu.className}>{menu.content}</Menu.SubmenuContent>
              </Menu.SubmenuRoot>
            ))}
          </BarMenu>
        )}
      </BaseMenubar>
      {end !== undefined && (
        <div ref={endBox} className="flex shrink-0 items-center">
          {end}
        </div>
      )}
      <div
        ref={measure}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex items-center"
      >
        {menus.map((menu) => (
          <span key={menu.id} className={TITLE}>
            {menu.title}
          </span>
        ))}
        <span className={TITLE}>
          <ListIcon weight="bold" className="size-4" />
        </span>
      </div>
    </div>
  );
}

interface BarMenuProps {
  readonly title: ReactNode;
  /** The name of a title that draws a glyph. */
  readonly label?: string;
  readonly className?: string;
  readonly returnTo: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}

/**
 * One title of the bar over its popup.
 *
 * A chosen item returns focus to `returnTo`, so the command acts where the reader was. Escape
 * returns it to the title, per the menubar pattern.
 */
function BarMenu({ title, label, className, returnTo, children }: BarMenuProps) {
  const chosen = useRef(false);

  return (
    <Menu.Root
      onOpenChange={(open, details) => {
        if (!open) chosen.current = details.reason === "item-press";
      }}
    >
      <Menu.Trigger aria-label={label} className={TITLE}>
        {title}
      </Menu.Trigger>
      <Menu.Content
        side="bottom"
        align="start"
        className={className}
        finalFocus={() => {
          const back = returnTo.current;
          return chosen.current && back !== null && back.isConnected ? back : true;
        }}
      >
        {children}
      </Menu.Content>
    </Menu.Root>
  );
}
/**
 * Returns how many titles of `menus` fit in `box`, from the widths that `measure` lays out.
 *
 * `measure` holds every title and then the overflow trigger, outside the flow of the row.
 */
function useFittingCount(
  box: RefObject<HTMLDivElement | null>,
  measure: RefObject<HTMLDivElement | null>,
  endBox: RefObject<HTMLDivElement | null>,
  menus: readonly MenubarMenu[],
): number {
  const [count, setCount] = useState(menus.length);
  const titles = menus.map((menu) => menu.title).join("\n");

  useLayoutEffect(() => {
    const element = box.current;
    const ruler = measure.current;
    if (element === null || ruler === null) return;

    function update() {
      if (element === null || ruler === null) return;

      const widths = [...ruler.children].map((child) => child.getBoundingClientRect().width);
      const overflow = widths.pop() ?? 0;
      const taken =
        endBox.current === null ? 0 : endBox.current.getBoundingClientRect().width + END_GAP;
      setCount(fittingMenuCount(element.getBoundingClientRect().width - taken, widths, overflow));
    }

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(ruler);
    if (endBox.current !== null) observer.observe(endBox.current);
    return () => observer.disconnect();
  }, [box, measure, endBox, titles]);

  return Math.min(count, menus.length);
}

/**
 * Moves focus to the first title of `bar` on F10 or on a press and release of Alt alone, and
 * back to `returnTo` on the next.
 *
 * The keys apply while focus is inside `scope`, inside the bar or on no element. An Alt that
 * another key or a pointer press follows before its release is a modifier and moves nothing.
 */
function useBarKeys(
  bar: RefObject<HTMLDivElement | null>,
  scope: RefObject<HTMLElement | null> | undefined,
  returnTo: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    let armed = false;

    function applies(): boolean {
      const active = document.activeElement;
      if (active === null || active === document.body) return true;
      if (bar.current?.contains(active)) return true;
      if (active.closest("[role='menu']") !== null) return false;

      return scope === undefined || scope.current?.contains(active) === true;
    }

    function toggle() {
      const element = bar.current;
      const active = document.activeElement;
      if (element === null) return;

      if (active !== null && element.contains(active)) {
        const back = returnTo.current;
        if (back !== null && back.isConnected) back.focus();
        else (active as HTMLElement).blur();
        return;
      }

      returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
      titlesOf(element)[0]?.focus();
    }

    function keyDown(event: globalThis.KeyboardEvent) {
      const plain = !event.ctrlKey && !event.shiftKey && !event.metaKey;
      if (event.key === "Alt" && plain && !event.repeat) {
        armed = true;
        return;
      }

      armed = false;
      if (event.key === "F10" && plain && !event.altKey && applies()) {
        event.preventDefault();
        toggle();
      }
    }

    function keyUp(event: globalThis.KeyboardEvent) {
      if (event.key !== "Alt") return;

      const pressed = armed;
      armed = false;
      if (pressed && applies()) {
        event.preventDefault();
        toggle();
      }
    }

    function disarm() {
      armed = false;
    }

    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp, true);
    window.addEventListener("pointerdown", disarm, true);
    window.addEventListener("blur", disarm);
    return () => {
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("pointerdown", disarm, true);
      window.removeEventListener("blur", disarm);
    };
  }, [bar, scope, returnTo]);
}

/** Returns the title triggers of `bar`, in bar order. */
function titlesOf(bar: HTMLElement | null): HTMLElement[] {
  if (bar === null) return [];

  return [...bar.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
}

/** Returns the next title after `from` whose text starts with `letter`, or null for none. */
function nextTitle(titles: readonly HTMLElement[], from: HTMLElement, letter: string) {
  const start = titles.indexOf(from);
  const wanted = letter.toLowerCase();

  for (let step = 1; step <= titles.length; step++) {
    const title = titles[(start + step) % titles.length];
    if (title?.textContent?.trim().toLowerCase().startsWith(wanted)) return title;
  }

  return null;
}
