import { SharedClient } from "@/hooks/use-rpc2"
import {
  LoadRecordsResponse,
  LoginUserResponse,
  MonitorResponse,
  NezhaLoadRecord,
  NezhaMonitor,
  ServerGroupResponse,
  ServiceResponse,
  SettingResponse,
} from "@/types/nezha-api"
import { DateTime } from "luxon"

import { getKomariNodes, uuidToNumber } from "./utils"

//let lastestRefreshTokenAt = 0

export const fetchServerGroup = async (): Promise<ServerGroupResponse> => {
  const kmNodes: Record<string, any> = await getKomariNodes()

  if (kmNodes?.error) {
    throw new Error(kmNodes.error)
  }
  // extract groups
  let groups: string[] = []
  Object.entries(kmNodes).forEach(([_, value]) => {
    if (value.group && !groups.includes(value.group)) {
      groups.push(value.group)
    }
  })

  const data: ServerGroupResponse = {
    success: true,
    data: [
      ...groups.map((group, index) => ({
        group: {
          id: index,
          created_at: DateTime.now().toISO() || "",
          updated_at: DateTime.now().toISO() || "",
          name: group,
        },
        servers: Object.entries(kmNodes)
          .filter(([_, value]) => value.group === group)
          .map(([key, _]) => uuidToNumber(key)),
      })),
    ],
  }
  return data
}

export const fetchLoginUser = async (): Promise<LoginUserResponse> => {
  const km_me = await SharedClient().call("common:getMe")
  if (km_me.error) {
    throw new Error(km_me.error)
  }
  const data: LoginUserResponse = {
    success: true,
    data: {
      id: uuidToNumber(km_me.uuid),
      username: km_me.username,
      password: "********",
      created_at: DateTime.now().toISO() || "",
      updated_at: DateTime.now().toISO() || "",
    },
  }
  return data
}
// TODO
export const fetchMonitor = async (server_id: number, hours = 24): Promise<MonitorResponse> => {
  // 获取 uuid 和服务器名称
  const km_nodes: Record<string, any> = await getKomariNodes()
  if (km_nodes?.error) {
    throw new Error(km_nodes.error)
  }
  const uuid = Object.keys(km_nodes).find((id) => uuidToNumber(id) === server_id)
  if (!uuid) {
    return { success: true, data: [] }
  }
  const serverName = km_nodes[uuid]?.name || String(server_id)

  const safeHours = Math.max(1, Math.floor(hours))
  const km_monitors: any = await SharedClient().call("common:getRecords", {
    type: "ping",
    uuid: uuid,
    maxCount: 4000,
    hours: safeHours,
  })
  if (km_monitors?.error) {
    throw new Error(km_monitors.error)
  }

  // 将 km_monitors 转换为 NezhaMonitor[]
  const seriesByTask = new Map<number, NezhaMonitor>()

  type MonitorRecord = { task_id?: number; time?: string; value?: number; name?: string }

  const ensureSeries = (id: number, name: string) => {
    if (!seriesByTask.has(id)) {
      seriesByTask.set(id, {
        monitor_id: id,
        monitor_name: name,
        server_id,
        server_name: serverName,
        created_at: [],
        avg_delay: [],
      })
    }
    return seriesByTask.get(id)!
  }

  const appendRecord = (rec: MonitorRecord, nameOverride?: string) => {
    const id: number = typeof rec.task_id === "number" ? rec.task_id : 0
    const name: string = nameOverride ?? rec.name ?? `task_${id}`
    const s = ensureSeries(id, name)
    const ts = Date.parse(rec.time ?? "")
    if (!Number.isFinite(ts)) return
    const val = Number(rec.value)
    if (!Number.isFinite(val)) return
    // -1 表示丢包，转为 null 供图表跳过、calculatePacketLoss 识别
    s.created_at.push(ts)
    s.avg_delay.push(val === -1 ? null : val)
  }

  if (km_monitors && Array.isArray(km_monitors.tasks) && Array.isArray(km_monitors.records)) {
    for (const task of km_monitors.tasks) {
      ensureSeries(task.id, task.name)
    }

    for (const rec of km_monitors.records) {
      appendRecord(rec)
    }
  } else if (Array.isArray(km_monitors?.records)) {
    // RPC2 getRecords 结构：{ records: PingRecord[] }
    for (const rec of km_monitors.records) {
      appendRecord(rec)
    }
  } else if (Array.isArray(km_monitors)) {
    // 可能是纯 records 数组 [{ task_id, time, value, name? }]
    for (const rec of km_monitors) {
      appendRecord(rec)
    }
  } else {
    // 未知结构，返回空
  }

  // 每个序列按时间升序
  const data = Array.from(seriesByTask.values()).map((s) => {
    const zip = s.created_at.map((t, i) => ({ t, v: s.avg_delay[i] }))
    zip.sort((a, b) => a.t - b.t)
    return { ...s, created_at: zip.map((z) => z.t), avg_delay: zip.map((z) => z.v) }
  })

  // 避免空的 avg_delay
  for (const s of data) {
    if (s.avg_delay.length == 0) {
      s.avg_delay = [null]
      s.created_at = [Date.now()]
    }
  }

  return { success: true, data }
}
// TODO
export const fetchService = async (): Promise<ServiceResponse> => {
  const response = await SharedClient().call("NoSuchMethod")
  const data = await response.json()
  if (data.error) {
    throw new Error(data.error)
  }
  return data
}

export const fetchSetting = async (): Promise<SettingResponse> => {
  const km_public = await SharedClient().call("common:getPublicInfo")
  if (km_public.error) {
    throw new Error(km_public.error)
  }
  const km_version = await SharedClient().call("common:getVersion")
  const km_data: SettingResponse = {
    success: true,
    data: {
      config: {
        debug: false,
        language: "zh-CN",
        site_name: km_public.sitename,
        user_template: "",
        admin_template: "",
        custom_code: "", // km_public.custom_head 当作为主题时，Komari会自动在Head中插入该代码，留空即可
      },
      version: km_version.version || "unknown",
      record_preserve_time: km_public.record_preserve_time,
      ping_record_preserve_time: km_public.ping_record_preserve_time,
    },
  }
  return km_data
}

export const fetchServerLoadRecords = async (server_id: number, hours: number, maxCount = 4000): Promise<LoadRecordsResponse> => {
  const km_nodes: Record<string, any> = await getKomariNodes()
  if (km_nodes?.error) {
    throw new Error(km_nodes.error)
  }
  const uuid = Object.keys(km_nodes).find((id) => uuidToNumber(id) === server_id)
  if (!uuid) {
    return { success: true, data: [] }
  }

  const safeHours = Math.max(1, Math.floor(hours))
  const km_records: any = await SharedClient().call("common:getRecords", {
    type: "load",
    uuid: uuid,
    hours: safeHours,
    maxCount: maxCount,
    load_type: "all",
  })

  if (km_records?.error) {
    throw new Error(km_records.error)
  }

  if (Array.isArray(km_records?.records)) {
    return { success: true, data: km_records.records }
  }

  if (km_records?.records && typeof km_records.records === "object" && !Array.isArray(km_records.records)) {
    const recordMap = km_records.records as Record<string, NezhaLoadRecord[] | undefined>
    const recordList = recordMap[uuid]
    return { success: true, data: Array.isArray(recordList) ? recordList : [] }
  }

  return { success: true, data: [] }
}
