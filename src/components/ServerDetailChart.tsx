import { Card, CardContent } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { useWebSocketContext } from "@/hooks/use-websocket-context"
import { formatBytes } from "@/lib/format"
import { fetchServerLoadRecords } from "@/lib/nezha-api"
import { cn, formatNezhaInfo, formatRelativeTime, formatTime } from "@/lib/utils"
import { NezhaLoadRecord, NezhaServer, NezhaWebsocketResponse } from "@/types/nezha-api"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ServerDetailChartLoading } from "./loading/ServerDetailLoading"
import AnimatedCircularProgressBar from "./ui/animated-circular-progress-bar"

type gpuChartData = {
  timeStamp: string
  gpu: number
}

type cpuChartData = {
  timeStamp: string
  cpu: number
}

type processChartData = {
  timeStamp: string
  process: number
}

type diskChartData = {
  timeStamp: string
  disk: number
  disk_used: number
}

type memChartData = {
  timeStamp: string
  mem: number
  swap: number
  mem_used: number
  swap_used: number
}

type networkChartData = {
  timeStamp: string
  upload: number
  download: number
}

type connectChartData = {
  timeStamp: string
  tcp: number
  udp: number
}

type HistoryRecordWithTs = {
  record: NezhaLoadRecord
  ts: number
}

const getLastRecord = (historyRecords: NezhaLoadRecord[]) => {
  return historyRecords.length > 0 ? historyRecords[historyRecords.length - 1] : undefined
}

const buildHistoryServer = (serverId: number, historyRecords: NezhaLoadRecord[]): NezhaServer => {
  const lastRecord = getLastRecord(historyRecords)
  const memTotal = Number(lastRecord?.ram_total ?? 0)
  const swapTotal = Number(lastRecord?.swap_total ?? 0)
  const diskTotal = Number(lastRecord?.disk_total ?? 0)
  const gpuValue = lastRecord?.gpu

  return {
    id: serverId,
    name: String(serverId),
    public_note: "",
    last_active: "0000-00-00T00:00:00Z",
    country_code: "",
    display_index: 0,
    host: {
      platform: "",
      platform_version: "",
      cpu: [],
      gpu: [],
      mem_total: memTotal,
      disk_total: diskTotal,
      swap_total: swapTotal,
      arch: "",
      boot_time: 0,
      version: "",
    },
    state: {
      cpu: Number(lastRecord?.cpu ?? 0),
      mem_used: Number(lastRecord?.ram ?? 0),
      swap_used: Number(lastRecord?.swap ?? 0),
      disk_used: Number(lastRecord?.disk ?? 0),
      net_in_transfer: Number(lastRecord?.net_total_down ?? 0),
      net_out_transfer: Number(lastRecord?.net_total_up ?? 0),
      net_in_speed: Number(lastRecord?.net_in ?? 0),
      net_out_speed: Number(lastRecord?.net_out ?? 0),
      uptime: 0,
      load_1: Number(lastRecord?.load ?? 0),
      load_5: 0,
      load_15: 0,
      tcp_conn_count: Number(lastRecord?.connections ?? 0),
      udp_conn_count: Number(lastRecord?.connections_udp ?? 0),
      process_count: Number(lastRecord?.process ?? 0),
      temperatures: [],
      gpu: typeof gpuValue === "number" && gpuValue > 0 ? [gpuValue] : [],
    },
  }
}

export default function ServerDetailChart({ server_id, rangeHours, isRealtime }: { server_id: string; rangeHours: number; isRealtime: boolean }) {
  const { lastMessage, connected, messageHistory } = useWebSocketContext()
  const { t } = useTranslation()
  const { data: historyData, isLoading: historyLoading, isError: historyError } = useQuery({
    queryKey: ["server-load-records", server_id, rangeHours],
    queryFn: () => fetchServerLoadRecords(Number(server_id), rangeHours),
    enabled: !isRealtime && Boolean(server_id),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const historyRecordsWithTs = useMemo(() => {
    const records = historyData?.data ?? []
    if (records.length === 0) return [] as HistoryRecordWithTs[]
    return records
      .map((record) => {
        const ts = Date.parse(record.time)
        return Number.isFinite(ts) ? { record, ts } : null
      })
      .filter((item): item is HistoryRecordWithTs => item !== null)
      .sort((a, b) => a.ts - b.ts)
  }, [historyData?.data])

  const historyRecords = useMemo(() => historyRecordsWithTs.map((item) => item.record), [historyRecordsWithTs])

  if (isRealtime && !connected && !lastMessage) {
    return <ServerDetailChartLoading />
  }

  const nezhaWsData = lastMessage ? (JSON.parse(lastMessage.data) as NezhaWebsocketResponse) : null
  const wsServer = nezhaWsData?.servers.find((s) => s.id === Number(server_id)) || null

  if (isRealtime) {
    if (!nezhaWsData) {
      return <ServerDetailChartLoading />
    }
    if (!wsServer) {
      return <ServerDetailChartLoading />
    }
  } else if (historyLoading) {
    return <ServerDetailChartLoading />
  } else if (historyError) {
    return <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">{t("error.fetchFailed")}</div>
  }

  if (!isRealtime && historyRecords.length === 0) {
    return <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">{t("serverDetailChart.noData")}</div>
  }

  const server = wsServer ?? buildHistoryServer(Number(server_id), historyRecords)
  const now = nezhaWsData?.now ?? Date.now()
  const { online } = formatNezhaInfo(now, server)

  const gpuStats = server.state.gpu || []
  const gpuList = server.host.gpu || []
  const hasHistoryGpu = historyRecords.some((record) => typeof record.gpu === "number" && record.gpu > 0)

  return (
    <section className="grid md:grid-cols-2 lg:grid-cols-3 grid-cols-1 gap-3 server-charts">
      <CpuChart
        key={`cpu-${server.id}`}
        now={now}
        online={online}
        data={server}
        messageHistory={messageHistory}
        isRealtime={isRealtime}
        historyRecords={historyRecords}
        historyRecordsWithTs={historyRecordsWithTs}
      />
      {isRealtime && gpuStats.length >= 1 && gpuStats.some((v) => v > 0) && gpuList.length === gpuStats.length ? (
        gpuList.map((gpu, index) => (
          <GpuChart
            key={`${server.id}-gpu-${index}`}
            now={now}
            online={online}
            index={index}
            id={server.id}
            gpuStat={gpuStats[index]}
            gpuName={gpu}
            messageHistory={messageHistory}
            isRealtime={isRealtime}
            historyRecords={historyRecords}
            historyRecordsWithTs={historyRecordsWithTs}
          />
        ))
      ) : isRealtime && gpuStats.length > 0 && gpuStats.some((v) => v > 0) ? (
        gpuStats.map((gpu, index) => (
          <GpuChart
            key={`${server.id}-gpu-${index}`}
            now={now}
            online={online}
            index={index}
            id={server.id}
            gpuStat={gpu}
            gpuName={`#${index + 1}`}
            messageHistory={messageHistory}
            isRealtime={isRealtime}
            historyRecords={historyRecords}
            historyRecordsWithTs={historyRecordsWithTs}
          />
        ))
      ) : !isRealtime && hasHistoryGpu ? (
        <GpuChart
          key={`${server.id}-gpu-history`}
          now={now}
          online={online}
          index={0}
          id={server.id}
          gpuStat={historyRecords[historyRecords.length - 1]?.gpu ?? 0}
          gpuName={gpuList[0]}
          messageHistory={messageHistory}
          isRealtime={isRealtime}
          historyRecords={historyRecords}
          historyRecordsWithTs={historyRecordsWithTs}
        />
      ) : null}
      <ProcessChart
        key={`process-${server.id}`}
        now={now}
        online={online}
        data={server}
        messageHistory={messageHistory}
        isRealtime={isRealtime}
        historyRecords={historyRecords}
        historyRecordsWithTs={historyRecordsWithTs}
      />
      <DiskChart
        key={`disk-${server.id}`}
        now={now}
        online={online}
        data={server}
        messageHistory={messageHistory}
        isRealtime={isRealtime}
        historyRecords={historyRecords}
        historyRecordsWithTs={historyRecordsWithTs}
      />
      <MemChart
        key={`mem-${server.id}`}
        now={now}
        online={online}
        data={server}
        messageHistory={messageHistory}
        isRealtime={isRealtime}
        historyRecords={historyRecords}
        historyRecordsWithTs={historyRecordsWithTs}
      />
      <NetworkChart
        key={`network-${server.id}`}
        now={now}
        online={online}
        data={server}
        messageHistory={messageHistory}
        isRealtime={isRealtime}
        historyRecords={historyRecords}
        historyRecordsWithTs={historyRecordsWithTs}
      />
      <ConnectChart
        key={`connect-${server.id}`}
        now={now}
        online={online}
        data={server}
        messageHistory={messageHistory}
        isRealtime={isRealtime}
        historyRecords={historyRecords}
        historyRecordsWithTs={historyRecordsWithTs}
      />
    </section>
  )
}

function GpuChart({
  now,
  online,
  id,
  index,
  gpuStat,
  gpuName,
  messageHistory,
  isRealtime,
  historyRecords,
  historyRecordsWithTs,
}: {
  now: number
  online: boolean
  id: number
  index: number
  gpuStat: number
  gpuName?: string
  messageHistory: { data: string }[]
  isRealtime: boolean
  historyRecords: NezhaLoadRecord[]
  historyRecordsWithTs: HistoryRecordWithTs[]
}) {
  const [gpuChartData, setGpuChartData] = useState<gpuChartData[]>([])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const historyGpuData = useMemo(() => {
    if (historyRecordsWithTs.length === 0) return [] as gpuChartData[]
    return historyRecordsWithTs.map(({ record, ts }) => ({
      timeStamp: ts.toString(),
      gpu: Number(record.gpu ?? 0),
    }))
  }, [historyRecordsWithTs])

  const lastRecord = getLastRecord(historyRecords)
  const currentGpu = isRealtime ? gpuStat : Number(lastRecord?.gpu ?? 0)

  // 初始化历史数据
  useEffect(() => {
    if (!isRealtime) return
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === id)
          if (!server) return null
          const { gpu } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            gpu: gpu[index],
          }
        })
        .filter((item): item is gpuChartData => item !== null)
        .reverse()

      setGpuChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [id, index, isRealtime, messageHistory])

  useEffect(() => {
    if (!isRealtime) return
    if (!online) return
    if (Number.isFinite(gpuStat) && historyLoaded) {
      const timestamp = now.toString()
      setGpuChartData((prevData) => {
        let newData = [] as gpuChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, gpu: gpuStat },
            { timeStamp: timestamp, gpu: gpuStat },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, gpu: gpuStat }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [gpuStat, historyLoaded, isRealtime, now, online])

  const chartConfig = {
    gpu: {
      label: "GPU",
    },
  } satisfies ChartConfig

  return (
    <Card
      className={cn("flex flex-col", {
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3 mt-auto">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <section className="flex flex-col items-center gap-2">
              {!gpuName && <p className="text-md font-medium">GPU</p>}
              {gpuName && <p className="text-xs mt-1 mb-1.5">GPU: {gpuName}</p>}
            </section>
            <section className="flex items-center gap-2">
              <p className="text-xs text-end w-10 font-medium">{currentGpu.toFixed(2)}%</p>
              <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={currentGpu} primaryColor="hsl(var(--chart-3))" />
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={isRealtime ? gpuChartData : historyGpuData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatRelativeTime(value)}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent labelFormatter={(value) => formatTime(Number(value))} />}
              />
              <Area isAnimationActive={false} dataKey="gpu" type="step" fill="hsl(var(--chart-3))" fillOpacity={0.3} stroke="hsl(var(--chart-3))" />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function CpuChart({
  now,
  online,
  data,
  messageHistory,
  isRealtime,
  historyRecords,
  historyRecordsWithTs,
}: {
  now: number
  online: boolean
  data: NezhaServer
  messageHistory: { data: string }[]
  isRealtime: boolean
  historyRecords: NezhaLoadRecord[]
  historyRecordsWithTs: HistoryRecordWithTs[]
}) {
  const [cpuChartData, setCpuChartData] = useState<cpuChartData[]>([])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const { cpu } = formatNezhaInfo(now, data)
  const lastRecord = getLastRecord(historyRecords)
  const historyCpu = Number(lastRecord?.cpu ?? 0)
  const currentCpu = isRealtime ? cpu : historyCpu

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  // 初始化历史数据
  useEffect(() => {
    if (!isRealtime) return
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { cpu } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            cpu: cpu,
          }
        })
        .filter((item): item is cpuChartData => item !== null)
        .reverse() // 保持时间顺序

      setCpuChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [data.id, isRealtime, messageHistory])

  // 更新实时数据
  useEffect(() => {
    if (!isRealtime) return
    if (!online) return
    if (historyLoaded) {
      const timestamp = now.toString()
      setCpuChartData((prevData) => {
        let newData = [] as cpuChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, cpu: cpu },
            { timeStamp: timestamp, cpu: cpu },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, cpu: cpu }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [cpu, historyLoaded, isRealtime, now, online])

  const historyCpuData = useMemo(() => {
    if (historyRecordsWithTs.length === 0) return [] as cpuChartData[]
    return historyRecordsWithTs.map(({ record, ts }) => ({
      timeStamp: ts.toString(),
      cpu: Number(record.cpu ?? 0),
    }))
  }, [historyRecordsWithTs])

  const chartConfig = {
    cpu: {
      label: "CPU",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig

  return (
    <Card
      className={cn("flex flex-col", {
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3 mt-auto">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-md font-medium">CPU</p>
            <section className="flex items-center gap-2">
              <p className="text-xs text-end w-10 font-medium">{currentCpu.toFixed(2)}%</p>
              <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={currentCpu} primaryColor="hsl(var(--chart-1))" />
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={isRealtime ? cpuChartData : historyCpuData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatRelativeTime(value)}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatTime(Number(value))}
                    valueFormatter={(value) => `${Number(value).toFixed(2)}%`}
                  />
                }
              />
              <Area isAnimationActive={false} dataKey="cpu" type="step" fill="hsl(var(--chart-1))" fillOpacity={0.3} stroke="hsl(var(--chart-1))" />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function ProcessChart({
  now,
  online,
  data,
  messageHistory,
  isRealtime,
  historyRecords,
  historyRecordsWithTs,
}: {
  now: number
  online: boolean
  data: NezhaServer
  messageHistory: { data: string }[]
  isRealtime: boolean
  historyRecords: NezhaLoadRecord[]
  historyRecordsWithTs: HistoryRecordWithTs[]
}) {
  const { t } = useTranslation()
  const [processChartData, setProcessChartData] = useState([] as processChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { process } = formatNezhaInfo(now, data)
  const lastRecord = getLastRecord(historyRecords)
  const historyProcess = Number(lastRecord?.process ?? 0)
  const currentProcess = isRealtime ? process : historyProcess

  // 初始化历史数据
  useEffect(() => {
    if (!isRealtime) return
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { process } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            process,
          }
        })
        .filter((item): item is processChartData => item !== null)
        .reverse()

      setProcessChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [data.id, isRealtime, messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (!isRealtime) return
    if (!online) return
    if (historyLoaded) {
      const timestamp = now.toString()
      setProcessChartData((prevData) => {
        let newData = [] as processChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, process },
            { timeStamp: timestamp, process },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, process }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [historyLoaded, isRealtime, now, online, process])

  const historyProcessData = useMemo(() => {
    if (historyRecordsWithTs.length === 0) return [] as processChartData[]
    return historyRecordsWithTs.map(({ record, ts }) => ({
      timeStamp: ts.toString(),
      process: Number(record.process ?? 0),
    }))
  }, [historyRecordsWithTs])

  const chartConfig = {
    process: {
      label: "Proc",
    },
  } satisfies ChartConfig

  return (
    <Card
      className={cn("flex flex-col", {
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3 mt-auto">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-md font-medium">{t("serverDetailChart.process")}</p>
            <section className="flex items-center gap-2">
              <p className="text-xs text-end w-10 font-medium">{currentProcess}</p>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={isRealtime ? processChartData : historyProcessData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatRelativeTime(value)}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} />
              <Area
                isAnimationActive={false}
                dataKey="process"
                type="step"
                fill="hsl(var(--chart-2))"
                fillOpacity={0.3}
                stroke="hsl(var(--chart-2))"
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatTime(Number(value))}
                  />
                }
              />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function MemChart({
  now,
  online,
  data,
  messageHistory,
  isRealtime,
  historyRecords,
  historyRecordsWithTs,
}: {
  now: number
  online: boolean
  data: NezhaServer
  messageHistory: { data: string }[]
  isRealtime: boolean
  historyRecords: NezhaLoadRecord[]
  historyRecordsWithTs: HistoryRecordWithTs[]
}) {
  const { t } = useTranslation()
  const [memChartData, setMemChartData] = useState([] as memChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { mem, swap } = formatNezhaInfo(now, data)
  const lastRecord = getLastRecord(historyRecords)
  const memUsed = data.state.mem_used
  const swapUsed = data.state.swap_used
  const historyMemTotal = Number(lastRecord?.ram_total ?? 0)
  const historyMemUsed = Number(lastRecord?.ram ?? 0)
  const historySwapTotal = Number(lastRecord?.swap_total ?? 0)
  const historySwapUsed = Number(lastRecord?.swap ?? 0)
  const historyMemPercent = historyMemTotal > 0 ? (historyMemUsed / historyMemTotal) * 100 : 0
  const historySwapPercent = historySwapTotal > 0 ? (historySwapUsed / historySwapTotal) * 100 : 0
  const currentMem = isRealtime ? mem : historyMemPercent
  const currentSwap = isRealtime ? swap : historySwapPercent

  // 初始化历史数据
  useEffect(() => {
    if (!isRealtime) return
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { mem, swap } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            mem,
            swap,
            mem_used: server.state.mem_used,
            swap_used: server.state.swap_used,
          }
        })
        .filter((item): item is memChartData => item !== null)
        .reverse()

      setMemChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [data.id, isRealtime, messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (!isRealtime) return
    if (!online) return
    if (historyLoaded) {
      const timestamp = now.toString()
      setMemChartData((prevData) => {
        let newData = [] as memChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, mem, swap, mem_used: memUsed, swap_used: swapUsed },
            { timeStamp: timestamp, mem, swap, mem_used: memUsed, swap_used: swapUsed },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, mem, swap, mem_used: memUsed, swap_used: swapUsed }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [historyLoaded, isRealtime, mem, memUsed, now, online, swap, swapUsed])

  const historyMemData = useMemo(() => {
    if (historyRecordsWithTs.length === 0) return [] as memChartData[]
    return historyRecordsWithTs.map(({ record, ts }) => {
      const memTotal = Number(record.ram_total ?? 0)
      const memUsed = Number(record.ram ?? 0)
      const swapTotal = Number(record.swap_total ?? 0)
      const swapUsed = Number(record.swap ?? 0)
      return {
        timeStamp: ts.toString(),
        mem: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
        swap: swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0,
        mem_used: memUsed,
        swap_used: swapUsed,
      }
    })
  }, [historyRecordsWithTs])

  const chartConfig = {
    mem: {
      label: "RAM",
      color: "hsl(var(--chart-8))",
    },
    swap: {
      label: "Swap",
      color: "hsl(var(--chart-10))",
    },
  } satisfies ChartConfig

  return (
    <Card
      className={cn("flex flex-col", {
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3 mt-auto">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <section className="flex items-center gap-4">
              <div className="flex flex-col">
                <p className=" text-xs text-muted-foreground">{t("serverDetailChart.mem")}</p>
                <div className="flex items-center gap-2">
                  <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={currentMem} primaryColor="hsl(var(--chart-8))" />
                  <p className="text-xs font-medium">{currentMem.toFixed(0)}%</p>
                </div>
              </div>
              <div className="flex flex-col">
                <p className=" text-xs text-muted-foreground">{t("serverDetailChart.swap")}</p>
                <div className="flex items-center gap-2">
                  <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={currentSwap} primaryColor="hsl(var(--chart-10))" />
                  <p className="text-xs font-medium">{currentSwap.toFixed(0)}%</p>
                </div>
              </div>
            </section>
            <section className="flex flex-col items-end gap-0.5">
              <div className="flex text-[11px] font-medium items-center gap-2">
                {isRealtime ? formatBytes(data.state.mem_used) : formatBytes(historyMemUsed)} /{" "}
                {isRealtime ? formatBytes(data.host.mem_total) : formatBytes(historyMemTotal)}
              </div>
              <div className="flex text-[11px] font-medium items-center gap-2">
                {isRealtime ? (
                  data.host.swap_total ? (
                    <>
                      Swap: {formatBytes(data.state.swap_used)}
                    </>
                  ) : (
                    <>no swap</>
                  )
                ) : historySwapTotal ? (
                  <>Swap: {formatBytes(historySwapUsed)}</>
                ) : (
                  <>no swap</>
                )}
              </div>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={isRealtime ? memChartData : historyMemData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatRelativeTime(value)}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatTime(Number(value))}
                    valueFormatter={(_value, name, _item, _index, payload) => {
                      const data = payload as memChartData
                      const bytes = name === "mem" ? data.mem_used : data.swap_used
                      return bytes === 0 ? "0" : formatBytes(bytes, 1)
                    }}
                  />
                }
              />
              <Area isAnimationActive={false} dataKey="mem" type="step" fill="hsl(var(--chart-8))" fillOpacity={0.3} stroke="hsl(var(--chart-8))" />
              <Area
                isAnimationActive={false}
                dataKey="swap"
                type="step"
                fill="hsl(var(--chart-10))"
                fillOpacity={0.3}
                stroke="hsl(var(--chart-10))"
              />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function DiskChart({
  now,
  online,
  data,
  messageHistory,
  isRealtime,
  historyRecords,
  historyRecordsWithTs,
}: {
  now: number
  online: boolean
  data: NezhaServer
  messageHistory: { data: string }[]
  isRealtime: boolean
  historyRecords: NezhaLoadRecord[]
  historyRecordsWithTs: HistoryRecordWithTs[]
}) {
  const { t } = useTranslation()
  const [diskChartData, setDiskChartData] = useState([] as diskChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { disk } = formatNezhaInfo(now, data)
  const lastRecord = getLastRecord(historyRecords)
  const diskUsed = data.state.disk_used
  const historyDiskTotal = Number(lastRecord?.disk_total ?? 0)
  const historyDiskUsed = Number(lastRecord?.disk ?? 0)
  const historyDiskPercent = historyDiskTotal > 0 ? (historyDiskUsed / historyDiskTotal) * 100 : 0
  const currentDisk = isRealtime ? disk : historyDiskPercent

  // 初始化历史数据
  useEffect(() => {
    if (!isRealtime) return
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { disk } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            disk,
            disk_used: server.state.disk_used,
          }
        })
        .filter((item): item is diskChartData => item !== null)
        .reverse()

      setDiskChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [data.id, isRealtime, messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (!isRealtime) return
    if (!online) return
    if (historyLoaded) {
      const timestamp = now.toString()
      setDiskChartData((prevData) => {
        let newData = [] as diskChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, disk, disk_used: diskUsed },
            { timeStamp: timestamp, disk, disk_used: diskUsed },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, disk, disk_used: diskUsed }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [disk, diskUsed, historyLoaded, isRealtime, now, online])

  const historyDiskData = useMemo(() => {
    if (historyRecordsWithTs.length === 0) return [] as diskChartData[]
    return historyRecordsWithTs.map(({ record, ts }) => {
      const diskTotal = Number(record.disk_total ?? 0)
      const diskUsed = Number(record.disk ?? 0)
      return {
        timeStamp: ts.toString(),
        disk: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0,
        disk_used: diskUsed,
      }
    })
  }, [historyRecordsWithTs])

  const chartConfig = {
    disk: {
      label: "Disk",
      color: "hsl(var(--chart-5))",
    },
  } satisfies ChartConfig

  return (
    <Card
      className={cn("flex flex-col", {
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3 mt-auto">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-md font-medium">{t("serverDetailChart.disk")}</p>
            <section className="flex flex-col items-end gap-0.5">
              <section className="flex items-center gap-2">
                <p className="text-xs text-end w-10 font-medium">{currentDisk.toFixed(0)}%</p>
                <AnimatedCircularProgressBar className="size-3 text-[0px]" max={100} min={0} value={currentDisk} primaryColor="hsl(var(--chart-5))" />
              </section>
              <div className="flex text-[11px] font-medium items-center gap-2">
                {isRealtime ? formatBytes(data.state.disk_used) : formatBytes(historyDiskUsed)} /{" "}
                {isRealtime ? formatBytes(data.host.disk_total) : formatBytes(historyDiskTotal)}
              </div>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart
              accessibilityLayer
              data={isRealtime ? diskChartData : historyDiskData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatRelativeTime(value)}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatTime(Number(value))}
                    valueFormatter={(_value, _name, _item, _index, payload) =>
                      formatBytes((payload as diskChartData).disk_used, 2)
                    }
                  />
                }
              />
              <Area isAnimationActive={false} dataKey="disk" type="step" fill="hsl(var(--chart-5))" fillOpacity={0.3} stroke="hsl(var(--chart-5))" />
            </AreaChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function NetworkChart({
  now,
  online,
  data,
  messageHistory,
  isRealtime,
  historyRecords,
  historyRecordsWithTs,
}: {
  now: number
  online: boolean
  data: NezhaServer
  messageHistory: { data: string }[]
  isRealtime: boolean
  historyRecords: NezhaLoadRecord[]
  historyRecordsWithTs: HistoryRecordWithTs[]
}) {
  const { t } = useTranslation()
  const [networkChartData, setNetworkChartData] = useState([] as networkChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { up, down } = formatNezhaInfo(now, data)
  const lastRecord = getLastRecord(historyRecords)
  const historyUp = Number(lastRecord?.net_out ?? 0) / 1024 / 1024
  const historyDown = Number(lastRecord?.net_in ?? 0) / 1024 / 1024
  const currentUp = isRealtime ? up : historyUp
  const currentDown = isRealtime ? down : historyDown

  // 初始化历史数据
  useEffect(() => {
    if (!isRealtime) return
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { up, down } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            upload: up,
            download: down,
          }
        })
        .filter((item): item is networkChartData => item !== null)
        .reverse()

      setNetworkChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [data.id, isRealtime, messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (!isRealtime) return
    if (!online) return
    if (historyLoaded) {
      const timestamp = now.toString()
      setNetworkChartData((prevData) => {
        let newData = [] as networkChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, upload: up, download: down },
            { timeStamp: timestamp, upload: up, download: down },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, upload: up, download: down }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [down, historyLoaded, isRealtime, now, online, up])

  const historyNetworkData = useMemo(() => {
    if (historyRecordsWithTs.length === 0) return [] as networkChartData[]
    return historyRecordsWithTs.map(({ record, ts }) => ({
      timeStamp: ts.toString(),
      upload: Number(record.net_out ?? 0) / 1024 / 1024,
      download: Number(record.net_in ?? 0) / 1024 / 1024,
    }))
  }, [historyRecordsWithTs])

  const renderData = isRealtime ? networkChartData : historyNetworkData
  let maxDownload = Math.max(...renderData.map((item) => item.download))
  maxDownload = Math.ceil(maxDownload)
  if (maxDownload < 1) {
    maxDownload = 1
  }

  const chartConfig = {
    upload: {
      label: "Up",
      color: "hsl(var(--chart-1))",
    },
    download: {
      label: "Down",
      color: "hsl(var(--chart-4))",
    },
  } satisfies ChartConfig

  return (
    <Card
      className={cn("flex flex-col", {
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3 mt-auto">
        <section className="flex flex-col gap-1">
          <div className="flex items-center">
            <section className="flex items-center gap-4">
              <div className="flex flex-col w-20">
                <p className="text-xs text-muted-foreground">{t("serverDetailChart.upload")}</p>
                <div className="flex items-center gap-1">
                  <span className="relative inline-flex  size-1.5 rounded-full bg-[hsl(var(--chart-1))]"></span>
                  <p className="text-xs font-medium">
                    {currentUp >= 1024
                      ? `${(currentUp / 1024).toFixed(2)}G/s`
                      : currentUp >= 1
                        ? `${currentUp.toFixed(2)}M/s`
                        : `${(currentUp * 1024).toFixed(2)}K/s`}
                  </p>
                </div>
              </div>
              <div className="flex flex-col w-20">
                <p className=" text-xs text-muted-foreground">{t("serverDetailChart.download")}</p>
                <div className="flex items-center gap-1">
                  <span className="relative inline-flex  size-1.5 rounded-full bg-[hsl(var(--chart-4))]"></span>
                  <p className="text-xs font-medium">
                    {currentDown >= 1024
                      ? `${(currentDown / 1024).toFixed(2)}G/s`
                      : currentDown >= 1
                        ? `${currentDown.toFixed(2)}M/s`
                        : `${(currentDown * 1024).toFixed(2)}K/s`}
                  </p>
                </div>
              </div>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <LineChart
              accessibilityLayer
              data={renderData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatRelativeTime(value)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                mirror={true}
                tickMargin={-15}
                type="number"
                minTickGap={50}
                interval="preserveStartEnd"
                domain={[0, maxDownload]}
                tickFormatter={(value) => `${value.toFixed(0)}M/s`}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatTime(Number(value))}
                    valueFormatter={(value) => {
                      const v = Number(value)
                      return v >= 1024
                        ? `${(v / 1024).toFixed(2)} G/s`
                        : v >= 1
                          ? `${v.toFixed(2)} M/s`
                          : `${(v * 1024).toFixed(2)} K/s`
                    }}
                  />
                }
              />
              <Line isAnimationActive={false} dataKey="upload" type="linear" stroke="hsl(var(--chart-1))" strokeWidth={1} dot={false} />
              <Line isAnimationActive={false} dataKey="download" type="linear" stroke="hsl(var(--chart-4))" strokeWidth={1} dot={false} />
            </LineChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}

function ConnectChart({
  now,
  online,
  data,
  messageHistory,
  isRealtime,
  historyRecords,
  historyRecordsWithTs,
}: {
  now: number
  online: boolean
  data: NezhaServer
  messageHistory: { data: string }[]
  isRealtime: boolean
  historyRecords: NezhaLoadRecord[]
  historyRecordsWithTs: HistoryRecordWithTs[]
}) {
  const [connectChartData, setConnectChartData] = useState([] as connectChartData[])
  const hasInitialized = useRef(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const customBackgroundImage = (window.CustomBackgroundImage as string) !== "" ? window.CustomBackgroundImage : undefined

  const { tcp, udp } = formatNezhaInfo(now, data)
  const lastRecord = getLastRecord(historyRecords)
  const historyTcp = Number(lastRecord?.connections ?? 0)
  const historyUdp = Number(lastRecord?.connections_udp ?? 0)
  const currentTcp = isRealtime ? tcp : historyTcp
  const currentUdp = isRealtime ? udp : historyUdp

  // 初始化历史数据
  useEffect(() => {
    if (!isRealtime) return
    if (!hasInitialized.current && messageHistory.length > 0) {
      const historyData = messageHistory
        .map((msg) => {
          const wsData = JSON.parse(msg.data) as NezhaWebsocketResponse
          const server = wsData.servers.find((s) => s.id === data.id)
          if (!server) return null
          const { tcp, udp } = formatNezhaInfo(wsData.now, server)
          return {
            timeStamp: wsData.now.toString(),
            tcp,
            udp,
          }
        })
        .filter((item): item is connectChartData => item !== null)
        .reverse()

      setConnectChartData(historyData)
      hasInitialized.current = true
      setHistoryLoaded(true)
    }
  }, [data.id, isRealtime, messageHistory])

  // 修改实时数据更新逻辑
  useEffect(() => {
    if (!isRealtime) return
    if (!online) return
    if (historyLoaded) {
      const timestamp = now.toString()
      setConnectChartData((prevData) => {
        let newData = [] as connectChartData[]
        if (prevData.length === 0) {
          newData = [
            { timeStamp: timestamp, tcp, udp },
            { timeStamp: timestamp, tcp, udp },
          ]
        } else {
          newData = [...prevData, { timeStamp: timestamp, tcp, udp }]
          if (newData.length > 30) {
            newData.shift()
          }
        }
        return newData
      })
    }
  }, [historyLoaded, isRealtime, now, online, tcp, udp])

  const historyConnectData = useMemo(() => {
    if (historyRecordsWithTs.length === 0) return [] as connectChartData[]
    return historyRecordsWithTs.map(({ record, ts }) => ({
      timeStamp: ts.toString(),
      tcp: Number(record.connections ?? 0),
      udp: Number(record.connections_udp ?? 0),
    }))
  }, [historyRecordsWithTs])

  const chartConfig = {
    tcp: {
      label: "TCP",
    },
    udp: {
      label: "UDP",
    },
  } satisfies ChartConfig

  return (
    <Card
      className={cn("flex flex-col", {
        "bg-card/70": customBackgroundImage,
      })}
    >
      <CardContent className="px-6 py-3 mt-auto">
        <section className="flex flex-col gap-1">
          <div className="flex items-center">
            <section className="flex items-center gap-4">
              <div className="flex flex-col w-12">
                <p className="text-xs text-muted-foreground">TCP</p>
                <div className="flex items-center gap-1">
                  <span className="relative inline-flex  size-1.5 rounded-full bg-[hsl(var(--chart-1))]"></span>
                  <p className="text-xs font-medium">{currentTcp}</p>
                </div>
              </div>
              <div className="flex flex-col w-12">
                <p className=" text-xs text-muted-foreground">UDP</p>
                <div className="flex items-center gap-1">
                  <span className="relative inline-flex  size-1.5 rounded-full bg-[hsl(var(--chart-4))]"></span>
                  <p className="text-xs font-medium">{currentUdp}</p>
                </div>
              </div>
            </section>
          </div>
          <ChartContainer config={chartConfig} className="aspect-auto h-[130px] w-full">
            <LineChart
              accessibilityLayer
              data={isRealtime ? connectChartData : historyConnectData}
              margin={{
                top: 12,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timeStamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={200}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatRelativeTime(value)}
              />
              <YAxis tickLine={false} axisLine={false} mirror={true} tickMargin={-15} type="number" interval="preserveStartEnd" />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent labelFormatter={(value) => formatTime(Number(value))} />}
              />
              <Line isAnimationActive={false} dataKey="tcp" type="linear" stroke="hsl(var(--chart-1))" strokeWidth={1} dot={false} />
              <Line isAnimationActive={false} dataKey="udp" type="linear" stroke="hsl(var(--chart-4))" strokeWidth={1} dot={false} />
            </LineChart>
          </ChartContainer>
        </section>
      </CardContent>
    </Card>
  )
}
