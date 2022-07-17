// Load .env file
import 'dotenv/config'

import { Spotify } from "./spotify/spotify";
import { checkUpdates } from "./utils/updateChecker";
import { parseConfig, Config } from "./utils/config";
import express, { Express } from 'express';
import { Frontend } from './frontend/frontend';
import { TwitchAuthChat } from './twitch/twitch_auth';
import cors from 'cors';

// Check for updates
checkUpdates();

// Parse config file
const config: Config = parseConfig("./spotipack_config.yaml");

// Build base app
const app: Express = express();
app.use(express.json());
app.use(cors({
  origin: '*'
}));

// Setup frontend
const frontend = new Frontend(app);

// Setup Spotify
const spotify = new Spotify(app);

// Setup Twitch
// TODO
const twitch = new TwitchAuthChat(config, app);

app.listen(config.express_port, () => {
  console.log('App is now running!');
});

twitch.authenticateUser();
