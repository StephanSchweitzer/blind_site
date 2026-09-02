import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { ButtonProps, buttonVariants } from "@/components/ui/button"

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
  <nav
    aria-label="Pagination"
    className={cn("mx-auto flex w-full justify-center", className)}
    {...props}
  />
)
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean
  /** Only meaningful in the button form (no href): greys out and blocks a
   *  control that would do nothing, instead of offering it as operable. */
  disabled?: boolean
} & Pick<ButtonProps, "size"> &
  React.ComponentProps<"a">

// Paging here never navigates — every call site passes href="#" and cancels the
// default. Announcing those as links tells a screen-reader user they are about
// to leave the page, and Space (the button key) does nothing on an anchor. So a
// control with no real href renders as a real <button> instead (RGAA 7.1).
const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  href,
  disabled,
  ...props
}: PaginationLinkProps) => {
  const sharedClassName = cn(
    buttonVariants({
      variant: isActive ? "outline" : "ghost",
      size,
    }),
    className
  )

  if (!href || href === "#") {
    return (
      <button
        type="button"
        aria-current={isActive ? "page" : undefined}
        disabled={disabled}
        className={sharedClassName}
        {...(props as React.ComponentProps<"button">)}
      />
    )
  }

  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      aria-disabled={disabled || undefined}
      className={sharedClassName}
      {...props}
    />
  )
}
PaginationLink.displayName = "PaginationLink"

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Page précédente"
    size="default"
    className={cn("gap-1 pl-2.5", className)}
    {...props}
  >
    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
    <span>Précédent</span>
  </PaginationLink>
)
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Page suivante"
    size="default"
    className={cn("gap-1 pr-2.5", className)}
    {...props}
  >
    <span>Suivant</span>
    <ChevronRight aria-hidden="true" className="h-4 w-4" />
  </PaginationLink>
)
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    aria-hidden="true"
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
  </span>
)
PaginationEllipsis.displayName = "PaginationEllipsis"

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
