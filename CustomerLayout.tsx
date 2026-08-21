import type { ReactNode } from "react";
import { CustomerChat } from "./CustomerChat";

export function CustomerLayout({ children }: { children: ReactNode }) {
  return <><>{children}</><CustomerChat /></>;
}
