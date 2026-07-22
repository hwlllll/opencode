import type {
  CommandStatusResponse,
  DeviceCommandAck,
  DeviceCommandRequest,
  UpdateCheckResponse,
  UpdateDeviceRequest,
} from "@/pages/workspace/types"
import { deviceApi, updateApi } from "@/pages/store/lib/api"

export const deviceManagementService = {
  async list() {
    const res = await deviceApi.list()
    return res.devices ?? []
  },

  async update(deviceId: string, data: UpdateDeviceRequest) {
    const res = await deviceApi.update(deviceId, data)
    return res.device
  },

  checkUpdate(platform: string, version: string): Promise<UpdateCheckResponse> {
    return updateApi.check(platform, version)
  },

  sendCommand(deviceId: string, cmd: DeviceCommandRequest): Promise<DeviceCommandAck> {
    return updateApi.sendCommand(deviceId, cmd)
  },

  getCommandStatus(deviceId: string, commandId: string): Promise<CommandStatusResponse | null> {
    return updateApi.getCommandStatus(deviceId, commandId)
  },

  remove(deviceId: string): Promise<void> {
    return deviceApi.remove(deviceId)
  },
}
