import axios, { AxiosInstance, AxiosResponse } from "axios";
import createAuthRefreshInterceptor, {
  AxiosAuthRefreshRequestConfig,
} from "axios-auth-refresh";
import qs from "qs";

type GetTokenArgs = {
  id: string;
  secret: string;
  refresh_token?: string;
};

export type OauthToken = {
  refresh_token: string;
  expires_in: number;
  token_type: string;
  access_token: string;
  ok: boolean;
};

function log(...args: any) {
  console.log(...args);
}

async function getToken(client: AxiosInstance, args: GetTokenArgs) {
  let { refresh_token } = args;

  log("refresh token", refresh_token);
  const refreshData = refresh_token ? { refresh_token } : {};

  const doReq = (data: typeof refreshData) =>
    client.request({
      method: "post",
      url: "oauth_token",
      data: qs.stringify({
        ...data,
        grant_type:
          data?.refresh_token !== undefined
            ? "refresh_token"
            : "client_credentials",
        client_id: args.id,
        client_secret: args.secret,
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      skipAuthRefresh: true,
    } as AxiosAuthRefreshRequestConfig);

  // If the refresh token failes try again without refresh
  let r: AxiosResponse<unknown, any>;
  try {
    r = await doReq(refreshData);
  } catch (e) {
    r = await doReq({});
  }

  const token = r.data as OauthToken;
  return token;
}

export function loadBandcampApi(options: {
  url: string;
  bandcampId: string;
  secret: string;
  readToken: () => Promise<OauthToken | undefined>;
  storeToken: (token: OauthToken) => Promise<void>;
}) {
  const { url, readToken, storeToken, secret, bandcampId } = options;

  const client = axios.create({ baseURL: url });

  // Append our bandcamp oauth token to all bandcamp requests
  client.interceptors.request.use(async (config) => {
    if (!config.headers) {
      config.headers = {};
    }
    const token = await readToken();
    if (token) {
      config.headers["Authorization"] = `Bearer ${token.access_token}`;
    }
    return config;
  });

  // If a token is expired, a request will fail with 401.
  // In that case, we get a new one using the refresh token,
  // if available.
  createAuthRefreshInterceptor(client, async (failedReq) => {
    log("refreshing token");
    const token = await readToken();
    log("current token", token);
    const newToken = await getToken(client, {
      id: bandcampId,
      secret,
      refresh_token: token?.refresh_token,
    });
    log("new token", newToken);
    await storeToken(newToken);
    failedReq.response.config.headers[
      "Authorization"
    ] = `Bearer ${newToken.access_token}`;
    return Promise.resolve();
  });

  return mkBandcampApi(client);
}

export type BandcampApi = ReturnType<typeof mkBandcampApi>;

type Band = {
  subdomain: string;
  name: string;
  band_id: number;
};

type Order = {
  buyer_note?: string;
  buyer_name: string;
  order_date: string;
  option_id?: number;
  ship_from_country_name: string;
  ship_to_zip: string;
  payment_state: string;
  discount_code?: string;
  ship_to_name: string;
  ship_to_country_code: string;
  ship_to_country: string;
  buyer_email: string;
  sku: string;
  sub_total: number;
  ship_to_street: string;
  ship_date?: string;
  order_total: number;
  package_id: number;
  tax?: number;
  ship_to_street_2?: string;
  sale_item_id: number;
  ship_notes?: string;
  shipping: number;
  option?: string;
  artist: string;
  ship_to_city: string;
  payment_id: number;
  selling_band_url: string;
  quantity: number;
  item_url: string;
  item_name: string;
  buyer_phone: string;
  paypal_id: string;
  currency: string;
  ship_to_state: string;
};

const mkBandcampApi = (client: AxiosInstance) => {
  return {
    async myBands(): Promise<Band[]> {
      const r = await client.post("api/account/1/my_bands");
      return r.data.bands as Band[];
    },
    async getMerchDetails(bandId: string) {
      const r = await client.post("api/merchorders/1/get_merch_details", {
        band_id: bandId,
        start_time: "1970-01-01",
      });
      return r.data.items;
    },
    async orders(args: {
      unshipped_only?: boolean;
      band_id: number;
      start_time?: string;
    }): Promise<Order[]> {
      const data = {
        unshipped_only: args.unshipped_only ?? true,
        start_time: args.start_time,
        band_id: args.band_id,
      };
      const r = await client.post(
        "https://bandcamp.com//api/merchorders/3/get_orders",
        data,
      );
      return r.data.items;
    },
  };
};
