import axios from 'axios';
import { SpotifyLogin } from './spotify_components/spotify_login';
import { Express } from 'express';

export class Spotify {

    private spotify_login: SpotifyLogin
    constructor(app: Express) {
        this.spotify_login = new SpotifyLogin(app);
        console.log('Spotify module online!');
    };

}
