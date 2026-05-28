"use client"

import { Collapsible as CollapsiblePrimitive } from "radix-ui"
export { CollapsibleContent } from "./collapsible-content"
export { CollapsibleTrigger } from "./collapsible-trigger"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

export { Collapsible }
