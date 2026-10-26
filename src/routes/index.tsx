import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Desk } from "@/components/app/desk";
import { Onboarding } from "@/components/app/onboarding";
import { useLinerStore } from "@/lib/briefing/store";

export const Route = createFileRoute("/")({ component: Home });

let sessionReady = false;

function Home() {
  const onboarded = useLinerStore((s) => s.onboarded);
  const acceptOnboarding = useLinerStore((s) => s.acceptOnboarding);
  const [hydrated, setHydrated] = useState(sessionReady);

  useEffect(() => {
    const finish = () => {
      sessionReady = true;
      setHydrated(true);
    };
    if (useLinerStore.persist?.hasHydrated?.()) {
      finish();
      return;
    }
    return useLinerStore.persist?.onFinishHydration?.(finish);
  }, []);

  if (!hydrated) {
    return <BootShell />;
  }

  if (!onboarded) {
    return <Onboarding onAccept={acceptOnboarding} />;
  }

  return <Desk />;
}

function BootShell() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 px-4 py-3">
        <p className="font-display text-lg font-medium tracking-tight">Лайнер</p>
        <p className="text-xs text-muted">Собираю бриф…</p>
      </header>
      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="h-24 animate-pulse rounded-xl bg-surface" />
        <div className="h-40 animate-pulse rounded-xl bg-surface" />
        <div className="h-40 animate-pulse rounded-xl bg-surface" />
      </div>
    </div>
  );
}