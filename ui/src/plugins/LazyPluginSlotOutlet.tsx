import type * as React from "react";

import { PluginSlotOutlet } from "./slots";

type LazyPluginSlotOutletProps = React.ComponentProps<typeof PluginSlotOutlet>;

export function LazyPluginSlotOutlet(props: LazyPluginSlotOutletProps) {
  return <PluginSlotOutlet {...props} />;
}
