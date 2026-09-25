import { Response } from 'express';

type Client = {
  id: string;
  res: Response;
  institutionId: string;
};

let clients: Client[] = [];

export function addEventClient(id: string, res: Response, institutionId: string) {
  clients.push({ id, res, institutionId });
}

export function removeEventClient(id: string) {
  clients = clients.filter((c) => c.id !== id);
}

export function broadcastEvent(institutionId: string, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients
    .filter((c) => institutionId === 'all' || c.institutionId === institutionId)
    .forEach((c) => {
      try {
        c.res.write(payload);
      } catch (err) {
        // Ignored, client will be cleaned up on close
      }
    });
}
