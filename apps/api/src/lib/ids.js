export function createRequestId() {
  return `req_${crypto.randomUUID().replaceAll("-", "")}`;
}
