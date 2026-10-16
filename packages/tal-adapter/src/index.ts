export class ConnectionRequiredError extends Error {
  readonly code = 'CONNECTION_REQUIRED';
  constructor() {
    super('尚未连接学而思账号');
    this.name = 'ConnectionRequiredError';
  }
}
/** 未配置官方接入时明确失败，禁止用演示数据替代真实结果。 */
export class DisconnectedTalAdapter {
  async listHomework(): Promise<never> {
    throw new ConnectionRequiredError();
  }
}
