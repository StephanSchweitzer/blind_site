// components/ui/table.tsx
'use client';

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Set by a `mobileCards` table so its rows and cells carry explicit ARIA
 * roles: once a phone lays the table out as blocks (see `.table-cards` in
 * app/globals.css), browsers stop exposing it as a table unless the roles say
 * so, and a screen reader would read the cells as loose text.
 */
const TableCardsContext = React.createContext(false)

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
    /**
     * Keeps the header row pinned under the back-office navigation bar while
     * the page scrolls. Only while the table fits its width: a table that
     * scrolls sideways needs a scroll container, and a sticky header inside a
     * scroll container sticks to that container, not to the page — so it
     * simply scrolls away with the rows, as before.
     */
    stickyHeader?: boolean
    /**
     * Below the `md` breakpoint, each row is laid out as a stacked block with
     * every value under its column's name, instead of a table the phone has
     * to scroll sideways. The names are read from the header row.
     */
    mobileCards?: boolean
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
    ({ className, stickyHeader = false, mobileCards = false, ...props }, ref) => {
        const wrapperRef = React.useRef<HTMLDivElement>(null)
        const tableRef = React.useRef<HTMLTableElement | null>(null)
        const [fits, setFits] = React.useState(false)

        const setRefs = React.useCallback(
            (node: HTMLTableElement | null) => {
                tableRef.current = node
                if (typeof ref === 'function') ref(node)
                else if (ref) ref.current = node
            },
            [ref],
        )

        // The table's laid-out width doesn't depend on its wrapper's overflow,
        // so switching the wrapper between scrolling and visible can't make
        // this flip back and forth. The observer fires once on observe(), which
        // is the initial measure.
        React.useEffect(() => {
            if (!stickyHeader) return
            const wrapper = wrapperRef.current
            const table = tableRef.current
            if (!wrapper || !table) return
            const observer = new ResizeObserver(() => {
                setFits(table.offsetWidth <= wrapper.clientWidth + 1)
            })
            observer.observe(wrapper)
            observer.observe(table)
            return () => observer.disconnect()
        }, [stickyHeader])

        // Each cell gets its column's name as `data-label`, which the stacked
        // phone layout prints before the value. Re-run whenever rows change
        // (a new page, a search) — attribute writes aren't observed, so this
        // can't feed itself.
        React.useEffect(() => {
            if (!mobileCards) return
            const table = tableRef.current
            if (!table) return
            const label = () => {
                const names: string[] = []
                table.querySelectorAll<HTMLTableCellElement>(':scope > thead > tr:last-child > th').forEach((th) => {
                    const name = th.textContent?.trim() ?? ''
                    for (let i = 0; i < (th.colSpan || 1); i++) names.push(name)
                })
                table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr').forEach((tr) => {
                    let column = 0
                    for (const cell of Array.from(tr.cells)) {
                        const name = names[column]
                        if (name) cell.setAttribute('data-label', name)
                        else cell.removeAttribute('data-label')
                        column += cell.colSpan || 1
                    }
                })
            }
            label()
            const observer = new MutationObserver(label)
            observer.observe(table, { childList: true, subtree: true })
            return () => observer.disconnect()
        }, [mobileCards])

        const sticky = stickyHeader && fits

        return (
            <TableCardsContext.Provider value={mobileCards}>
                <div
                    ref={wrapperRef}
                    className={cn("relative w-full", sticky ? "overflow-visible" : "overflow-auto")}
                >
                    <table
                        ref={setRefs}
                        role={mobileCards ? "table" : undefined}
                        className={cn(
                            "w-full caption-bottom text-sm",
                            sticky && "table-sticky-head",
                            mobileCards && "table-cards",
                            className,
                        )}
                        {...props}
                    />
                </div>
            </TableCardsContext.Provider>
        )
    },
)
Table.displayName = "Table"

const TableHeader = React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
    const cards = React.useContext(TableCardsContext)
    return <thead ref={ref} role={cards ? "rowgroup" : undefined} className={cn("[&_tr]:border-b", className)} {...props} />
})
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
    const cards = React.useContext(TableCardsContext)
    return (
        <tbody
            ref={ref}
            role={cards ? "rowgroup" : undefined}
            className={cn("[&_tr:last-child]:border-0", className)}
            {...props}
        />
    )
})
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
    <tfoot
        ref={ref}
        className={cn(
            "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
            className
        )}
        {...props}
    />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
    HTMLTableRowElement,
    React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => {
    const cards = React.useContext(TableCardsContext)
    return (
        <tr
            ref={ref}
            role={cards ? "row" : undefined}
            className={cn(
                "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
                className
            )}
            {...props}
        />
    )
})
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
    HTMLTableCellElement,
    React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
    const cards = React.useContext(TableCardsContext)
    return (
        <th
            ref={ref}
            role={cards ? "columnheader" : undefined}
            className={cn(
                "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
                className
            )}
            {...props}
        />
    )
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
    HTMLTableCellElement,
    React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
    const cards = React.useContext(TableCardsContext)
    return (
        <td
            ref={ref}
            role={cards ? "cell" : undefined}
            className={cn("p-4 align-middle break-words [&:has([role=checkbox])]:pr-0", className)}
            {...props}
        />
    )
})
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
    HTMLTableCaptionElement,
    React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
    <caption
        ref={ref}
        className={cn("mt-4 text-sm text-muted-foreground", className)}
        {...props}
    />
))
TableCaption.displayName = "TableCaption"

export {
    Table,
    TableHeader,
    TableBody,
    TableFooter,
    TableHead,
    TableRow,
    TableCell,
    TableCaption,
}
