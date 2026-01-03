// import { fetchSetting } from "@/lib/nezha-api"
// import { useQuery } from "@tanstack/react-query"
import React from "react"

const Footer: React.FC = () => {
  const isMac = /macintosh|mac os x/i.test(navigator.userAgent)

  // const { data: settingData } = useQuery({
  //   queryKey: ["setting"],
  //   queryFn: () => fetchSetting(),
  //   refetchOnMount: true,
  //   refetchOnWindowFocus: true,
  // })

  return (
    <footer className="mx-auto w-full max-w-5xl px-4 lg:px-0 pb-4 server-footer">
      <section className="flex flex-col">
        <section className="mt-1 flex items-center justify-center sm:justify-end text-[13px] font-light tracking-tight text-neutral-600/50 dark:text-neutral-300/50 server-footer-name">
          <p className="text-[13px] font-light tracking-tight text-neutral-600/50 dark:text-neutral-300/50">
            <kbd className="pointer-events-none mx-1 inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              {isMac ? <span className="text-xs">⌘</span> : "Ctrl "}K
            </kbd>
          </p>
        </section>
      </section>
    </footer>
  )
}

export default Footer
