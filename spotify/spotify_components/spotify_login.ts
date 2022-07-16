import express, { Express, Request, Response } from 'express';

export class SpotifyLogin {
  public app: Express;

  constructor(app: Express) {
    this.app = app;
    this.app.get('/', (req: Request, res: Response) => {
      res.send('Express + TS server');
    });
  }
}
