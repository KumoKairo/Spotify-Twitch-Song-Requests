import express, { Express } from 'express';

export class Frontend {
  private app: Express;

  constructor(app: Express) {
    this.app = app;
    this.app.use(express.static('public/html'));
  }
}
