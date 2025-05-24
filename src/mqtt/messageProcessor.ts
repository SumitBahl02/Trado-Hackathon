// client.ts
import mqtt from "mqtt";
import * as marketdata from "../proto/market_data_pb";
import * as subscriptionManager from "./subscriptionManager";
import * as db from "../db";
import * as utils from "../utils";

// Store LTP values for indices
const indexLtpMap = new Map<string, number>();
const atmStrikeMap = new Map<string, number>();

export function processMessage(
  topic: string,
  message: Buffer,
  client: mqtt.MqttClient
) {
  try {
    let decoded: any = null;
    let ltpValues: number[] = [];

    // Decode message as Protobuf or JSON
    try {
      decoded = marketdata.marketdata.MarketData.decode(
        new Uint8Array(message)
      );
      if (decoded && typeof decoded.ltp === "number") {
        ltpValues.push(decoded.ltp);
      }
    } catch (err) {
      try {
        decoded = marketdata.marketdata.MarketDataBatch.decode(
          new Uint8Array(message)
        );
        if (decoded && Array.isArray(decoded.data)) {
          ltpValues = decoded.data
            .map((d: any) => d.ltp)
            .filter((v: any) => typeof v === "number");
        }
      } catch (batchErr) {
        try {
          decoded = JSON.parse(message.toString());
          if (decoded && typeof decoded.ltp === "number") {
            ltpValues.push(decoded.ltp);
          }
        } catch (jsonErr) {
          console.error(
            "Failed to decode message as protobuf or JSON for topic:",
            topic
          );
        }
      }
    }

    for (const ltp of ltpValues) {
      const parts = topic.split("/");
      if (parts.length < 2) return;

      const topicSuffix = parts[1];
      const isOption = topicSuffix.startsWith("NSE_FO|");

      if (isOption) {
        const optionMeta = subscriptionManager.optionTopicMapping.get(topicSuffix);
        if (optionMeta) {
          db.saveToDatabase(`index/${topicSuffix}`, ltp, optionMeta.indexName, optionMeta.type, optionMeta.strike);
        } else {
          db.saveToDatabase(`index/${topicSuffix}`, ltp);
        }
      } else {
        const indexName = topicSuffix.toUpperCase();
        indexLtpMap.set(indexName, ltp);

        if (subscriptionManager.isFirstIndexMessage.get(indexName) === true) {
          const atmStrike = utils.getAtmStrike(indexName, ltp);
          atmStrikeMap.set(indexName, atmStrike);

          subscriptionManager.subscribeToAtmOptions(client, indexName, atmStrike);
          subscriptionManager.isFirstIndexMessage.set(indexName, false);
        }

        db.saveToDatabase(`index/${indexName}`, ltp, indexName, undefined, );
      }
    }
  } catch (error) {
    console.error("Error processing message:", error);
  }
}