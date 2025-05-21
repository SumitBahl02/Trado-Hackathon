import mqtt from "mqtt";
import { config, INDICES, EXPIRY_DATES, STRIKE_RANGE } from "../config";
import * as utils from "../utils";

export const activeSubscriptions = new Set<string>();
export const isFirstIndexMessage = new Map<string, boolean>();

export function subscribeToAllIndices(client: mqtt.MqttClient) {
  INDICES.forEach((indexName) => {
    const topic = `${config.app.indexPrefix}/${indexName}`;
    console.log(`Subscribing to index: ${topic}`);
    client.subscribe(topic, (err) => {
      if (err) {
        console.error(`Failed to subscribe to topic: ${topic}`, err);
      } else {
        console.log(`Subscribed to topic: ${topic}`);
        activeSubscriptions.add(topic);
      }
    });
  });
}

export function initializeFirstMessageTracking() {
  INDICES.forEach((indexName) => {
    isFirstIndexMessage.set(indexName, true);
  });
}

export async function subscribeToAtmOptions(
  client: mqtt.MqttClient,
  indexName: string,
  atmStrike: number
) {
  console.log(`Subscribing to ${indexName} options around ATM ${atmStrike}`);

  const strikeDiff = utils.getStrikeDiff(indexName);
  const strikes = [];
  for (let i = -STRIKE_RANGE; i <= STRIKE_RANGE; i++) {
    strikes.push(atmStrike + i * strikeDiff);
  }

  for (const strike of strikes) {
    for (const optionType of ["ce", "pe"] as const) {
      const token = await getOptionToken(indexName, strike, optionType);
      if (token) {
        const topic = `${config.app.indexPrefix}/NSE_FO|${token}`;
        if (!activeSubscriptions.has(topic)) {
          client.subscribe(topic, (err) => {
            if (err) {
              console.error(`Failed to subscribe to topic: ${topic}`, err);
            } else {
              console.log(`Subscribed to option topic: ${topic}`);
              activeSubscriptions.add(topic);
            }
          });
        }
      }
    }
  }
}

export async function getOptionToken(
  indexName: string,
  strikePrice: number,
  optionType: "ce" | "pe"
): Promise<string | null> {
  try {
    const expiryDate = EXPIRY_DATES[indexName as keyof typeof EXPIRY_DATES];
    const url = `https://api.trado.trade/token?index=${indexName}&expiryDate=${expiryDate}&optionType=${optionType}&strikePrice=${strikePrice}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success && data.data.token) {
      return data.data.token.toString();
    }
  } catch (error) {
    console.error(
      `Error fetching token for ${indexName} ${strikePrice} ${optionType}:`,
      error
    );
  }
  return null;
}
