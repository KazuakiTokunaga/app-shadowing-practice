"use client";

import { createContext, useContext } from "react";
import type { Navigation } from "./types";

const NavigationContext = createContext<Navigation | null>(null);

export const NavigationProvider = NavigationContext.Provider;

export function useNavigation(): Navigation {
  const nav = useContext(NavigationContext);
  if (!nav) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return nav;
}
