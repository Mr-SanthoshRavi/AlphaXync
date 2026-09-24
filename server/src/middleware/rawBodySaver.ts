import { Request, Response, NextFunction } from 'express';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
  headers: any;
  body: any;
}

export function rawBodySaver(req: RequestWithRawBody, res: Response, buf: Buffer, encoding: BufferEncoding) {
  if (buf && buf.length) {
    req.rawBody = buf;
  }
}
