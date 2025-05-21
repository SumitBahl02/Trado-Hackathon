import mqtt from "mqtt";
import { config } from "../config";

export function createClient(): mqtt.MqttClient {
  // TODO: Implement this function
  // 1. Create MQTT client using configuration
  // 2. Return the client

  const connectUrl = `mqtts://${config.mqtt.host}:${config.mqtt.port}`;

  const options: mqtt.IClientOptions = {
    clientId: config.mqtt.clientId,
    clean: true,
    connectTimeout: 4000,
    username: config.mqtt.username,
    password: config.mqtt.password,
    reconnectPeriod: 1000,
  };

  return mqtt.connect(connectUrl, options);
}
