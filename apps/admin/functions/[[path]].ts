import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";
// @ts-expect-error - the build output type isn't generated yet
import * as build from "../build/server";

export const onRequest = createPagesFunctionHandler({ build });
