import "express"

declare module "express" {
  interface Request {
    requestId?: string
    rawBody?: Buffer
  }
}
