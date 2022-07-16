import axios from "axios";
import pack from './../package.json';

const UPDATE_URL: string = "https://api.github.com/repos/KumoKairo/Spotify-Twitch-Song-Requests/releases/latest";


export function checkUpdates() {
  axios.get(UPDATE_URL)
    .then(r => {
      console.log("---------------------------");
      if (r.data.tag_name !== pack.version) {
        console.log(`An update is available at ${r.data.html_url}`);
      }
      else {
        console.log(`Running latest version: ${pack.version}`)
      }
      console.log("---------------------------");
    }, () => console.log("Failed to check for updates."));
}
