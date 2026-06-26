export function getDeviceId(): string {
  let id = localStorage.getItem('holiday-go-where:device-id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('holiday-go-where:device-id', id)
  }
  return id
}
