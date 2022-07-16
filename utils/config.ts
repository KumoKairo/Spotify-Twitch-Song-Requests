import { readFileSync } from "fs";
import YAML from 'yaml';

export enum UsageType {
  COMMAND = 'command',
  CHANNELPOINTS = 'channel_points',
  BITS = 'bits'
}

export enum UserLevel {
  EVERYONE = 'everyone',
  VIP = 'vip',
  SUBSCRIBER = 'sub',
  MODERATOR = 'mod',
  STREAMER = 'streamer'
}

export type Config = {
  // Basic config
  user_name: string,
  channel_name: string,
  usage_message: string,
  wrong_format_message: string,
  added_to_queue_messages: [string],
  song_not_found_message: string,
  // Custom reward settings
  custom_reward_id: string,
  automatic_refunds_enabled: boolean,
  custom_reward_name: string,
  custom_reward_cost: number,
  // Internals
  express_port: number,
  logs_enabled: boolean,
  // Aliases and permissions
  usage_type: UsageType,
  command_alias: [string],
  command_user_level: [UserLevel],
  song_command_enabled: boolean,
  song_command_alias: [string],
  minimum_required_bits: number,
  skip_alias: [string],
  skip_user_level: [UserLevel]
}

export function parseConfig(configLocation: string): Config {
  // TODO: parse config here
  const fileData: string = readFileSync(configLocation, 'utf8');
  let config: Config = YAML.parse(fileData);
  return validateConfig(config);
}

function validateConfig(config: Config): Config {
  // TODO: validate types cleanly
  return config
}
