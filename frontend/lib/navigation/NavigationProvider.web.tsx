"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { NavigationProvider } from "./context";
import type { Navigation } from "./types";

export function WebNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const navigation: Navigation = {
    navigateToHome: useCallback(() => {
      router.push("/");
    }, [router]),
    navigateToExercise: useCallback(
      (id: number) => {
        router.push(`/exercises/${id}`);
      },
      [router]
    ),
    navigateToSettings: useCallback(() => {
      router.push("/settings");
    }, [router]),
  };

  return (
    <NavigationProvider value={navigation}>{children}</NavigationProvider>
  );
}
