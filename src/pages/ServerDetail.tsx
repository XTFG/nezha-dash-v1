import { NetworkChart } from "@/components/NetworkChart"
import ServerDetailChart from "@/components/ServerDetailChart"
import ServerDetailOverview from "@/components/ServerDetailOverview"
import TabSwitch from "@/components/TabSwitch"
import { Separator } from "@/components/ui/separator"
import { fetchSetting } from "@/lib/nezha-api"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { m } from "framer-motion"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

type RangeValue = number | "realtime"
type RangeOption = {
  value: RangeValue
  label: string
}

type RangeLabelFormatter = (hours: number) => string

const buildRangeOptions = (
  maxHours: number,
  baseHours: number[],
  formatLabel: RangeLabelFormatter,
  realtimeLabel: string,
  config?: { hideMaxWhenBelowOrEqual?: number },
) => {
  const baseMax = baseHours.length > 0 ? Math.max(...baseHours) : 24
  const safeMax = Number.isFinite(maxHours) && maxHours > 0 ? Math.floor(maxHours) : baseMax
  const rangeOptions: RangeOption[] = [{ value: "realtime", label: realtimeLabel }]
  if (config?.hideMaxWhenBelowOrEqual !== undefined && safeMax <= config.hideMaxWhenBelowOrEqual) {
    return rangeOptions
  }
  const filteredBase = baseHours.filter((hours) => hours <= safeMax)
  filteredBase.forEach((hours) => {
    rangeOptions.push({ value: hours, label: formatLabel(hours) })
  })
  if (!filteredBase.includes(safeMax)) {
    rangeOptions.push({ value: safeMax, label: formatLabel(safeMax) })
  }
  return rangeOptions
}

export default function ServerDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { id: server_id } = useParams()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [])

  const { data: settingData } = useQuery({
    queryKey: ["setting"],
    queryFn: () => fetchSetting(),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const tabs = ["Detail", "Network"]
  const [currentTab, setCurrentTab] = useState(tabs[0])
  const [detailRange, setDetailRange] = useState<RangeValue>("realtime")
  const [networkRange, setNetworkRange] = useState<RangeValue>("realtime")

  const formatRangeLabel = useCallback((hours: number) => {
    if (hours % 24 === 0) {
      return t("range.days", { count: hours / 24 })
    }
    return t("range.hours", { count: hours })
  }, [t])

  const detailOptions = useMemo(() => {
    const maxHours = Number(settingData?.data?.record_preserve_time)
    return buildRangeOptions(maxHours, [4, 24, 168, 720], formatRangeLabel, t("range.realtime"))
  }, [formatRangeLabel, settingData?.data?.record_preserve_time, t])

  const networkOptions = useMemo(() => {
    const maxHours = Number(settingData?.data?.ping_record_preserve_time)
    return buildRangeOptions(maxHours, [6, 12, 24, 168], formatRangeLabel, t("range.realtime"), { hideMaxWhenBelowOrEqual: 1 })
  }, [formatRangeLabel, settingData?.data?.ping_record_preserve_time, t])

  useEffect(() => {
    if (!server_id) {
      navigate("/404")
    }
  }, [navigate, server_id])

  useEffect(() => {
    if (!detailOptions.some((option) => option.value === detailRange)) {
      setDetailRange(detailOptions[detailOptions.length - 1]?.value ?? "realtime")
    }
  }, [detailOptions, detailRange])

  useEffect(() => {
    if (!networkOptions.some((option) => option.value === networkRange)) {
      setNetworkRange(networkOptions[networkOptions.length - 1]?.value ?? "realtime")
    }
  }, [networkOptions, networkRange])

  const detailRangeHours = typeof detailRange === "number" ? detailRange : 0
  const isDetailRealtime = detailRange === "realtime"
  const networkRangeHours = networkRange === "realtime" ? 1 : networkRange

  if (!server_id) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-0 flex flex-col gap-4 server-info">
      <ServerDetailOverview server_id={server_id} />
      <section className="flex items-center my-1 w-full">
        <Separator className="flex-1" />
        <div className="flex justify-center w-full max-w-[200px]">
          <TabSwitch tabs={tabs} currentTab={currentTab} setCurrentTab={setCurrentTab} />
        </div>
        <Separator className="flex-1" />
      </section>
      <section className="flex items-center justify-center w-full -mt-3">
        <div className="flex justify-center w-full max-w-[360px]">
          {currentTab === tabs[0] ? (
            <RangeSwitch options={detailOptions} currentValue={detailRange} setCurrentValue={setDetailRange} layoutId="detail-range-switch" />
          ) : (
            <RangeSwitch options={networkOptions} currentValue={networkRange} setCurrentValue={setNetworkRange} layoutId="network-range-switch" />
          )}
        </div>
      </section>
      <div style={{ display: currentTab === tabs[0] ? "block" : "none" }}>
        <ServerDetailChart server_id={server_id} rangeHours={detailRangeHours} isRealtime={isDetailRealtime} />
      </div>
      <div style={{ display: currentTab === tabs[1] ? "block" : "none" }}>
        <NetworkChart server_id={Number(server_id)} show={currentTab === tabs[1]} rangeHours={networkRangeHours} />
      </div>
    </div>
  )
}

function RangeSwitch({
  options,
  currentValue,
  setCurrentValue,
  layoutId,
}: {
  options: RangeOption[]
  currentValue: RangeValue
  setCurrentValue: (value: RangeValue) => void
  layoutId: string
}) {
  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  return (
    <div className="z-50 flex flex-col items-start rounded-[50px] server-info-tab">
      <div
        className={cn("flex items-center gap-1 rounded-[50px] bg-stone-100 p-[3px] dark:bg-stone-800", {
          "bg-stone-100/70 dark:bg-stone-800/70": customBackgroundImage,
        })}
      >
        {options.map((option) => (
          <div
            key={String(option.value)}
            onClick={() => setCurrentValue(option.value)}
            className={cn(
              "relative cursor-pointer rounded-3xl px-2.5 py-[8px] text-[13px] font-[600] transition-all duration-500",
              currentValue === option.value ? "text-black dark:text-white" : "text-stone-400 dark:text-stone-500",
            )}
          >
            {currentValue === option.value && (
              <m.div
                layoutId={layoutId}
                className="absolute inset-0 z-10 h-full w-full content-center bg-white shadow-lg shadow-black/5 dark:bg-stone-700 dark:shadow-white/5"
                style={{
                  originY: "0px",
                  borderRadius: 46,
                }}
              />
            )}
            <div className="relative z-20 flex items-center gap-1">
              <p className="whitespace-nowrap">{option.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
