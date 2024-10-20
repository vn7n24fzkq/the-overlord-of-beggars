import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import {
  ClientLoaderFunctionArgs,
  Form,
  redirect,
  replace,
  useLoaderData,
} from "@remix-run/react";
import searchStores from "~/services/search_stores";
import StoreTable from "./store_table";
import NearExpiredFoodTable from "./near_expired_food_table";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Toggle } from "~/components/ui/toggle";
import { makeSearchParamsObjSchema } from "~/lib/utils";
import { z } from "zod";
import { P, match } from "ts-pattern";
import { LocateFixed, Locate } from "lucide-react";
import { toString as toGeoString } from "~/models/geolocation";
import getNearExpiredFoodsByStoreId from "~/services/get_near_expired_foods_by_store_id";
import pProps from "p-props";

export const meta: MetaFunction = () => {
  return [
    { title: "首頁 | The Overload Of Beggars 乞丐超人" },
    //
  ];
};

const QuerySchema = makeSearchParamsObjSchema(
  z.object({
    location: z.string().nullish(),
    keyword: z.string().nullish(),
    stores: z.string().nullish(),
  })
);

export async function loader(args: LoaderFunctionArgs) {
  const query = await QuerySchema.parseAsync(
    new URL(args.request.url).searchParams
  );

  const stores = match(query)
    // 關鍵字 + 經緯度 搜尋附近的店家
    .with(
      {
        keyword: P.string.minLength(1),
        location: P.string.regex(/^\d+\.\d+,\d+\.\d+$/),
      },
      (query) => {
        const [latitude, longitude] = query.location.split(",").map(Number);
        return searchStores({
          keyword: query.keyword,
          location: { latitude, longitude },
        });
      }
    )

    // 關鍵字 搜尋附近的店家
    .with({ keyword: P.string.minLength(1) }, (query) => {
      return searchStores({ keyword: query.keyword });
    })

    // 經緯度 搜尋附近的店家
    .with(
      {
        location: P.string.regex(/^\d+\.\d+,\d+\.\d+$/),
      },
      (query) => {
        const [latitude, longitude] = query.location.split(",").map(Number);
        return searchStores({ location: { latitude, longitude } });
      }
    )

    // if neither keyword nor location is provided,
    // we'll just display the default page
    .otherwise(() => {
      return null;
    });

  const storesWithNearExpiredFoods = match(query.stores)
    .with(P.string.minLength(1), (query) =>
      Promise.all([
        getNearExpiredFoodsByStoreId(query).then((foods) => ({
          storeId: query,
          foods,
        })),
      ])
    )
    .otherwise(() => {
      return null;
    });

  return pProps({ query, stores, storesWithNearExpiredFoods });
}

export function clientLoader(args: ClientLoaderFunctionArgs) {
  const url = new URL(args.request.url);

  const query = QuerySchema.parse(url.searchParams);

  return match(query)
    .with({ keyword: "" }, () => {
      url.searchParams.delete("keyword");
      return replace(url.toString());
    })
    .with({ stores: "" }, () => {
      url.searchParams.delete("stores");
      return replace(url.toString());
    })
    .with({ location: "" }, () =>
      new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject)
      )
        .then((position) => {
          const location = toGeoString({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          url.searchParams.set("location", location);
          return replace(url.toString());
        })
        .catch(() => {
          url.searchParams.delete("location");
          return redirect(url.toString());
        })
    )
    .otherwise(() => args.serverLoader<typeof loader>());
}

function LocateToggle() {
  const data = useLoaderData<typeof clientLoader>();
  const pressed = Boolean(data?.query.location);

  if (pressed) {
    return (
      <Toggle
        key={pressed ? "on" : "off"}
        type="submit"
        className="group"
        defaultPressed={pressed}
      >
        <LocateFixed className="group-data-[state=off]:hidden" />
        <Locate className="group-data-[state=on]:hidden" />
      </Toggle>
    );
  }

  return (
    <Toggle
      key={pressed ? "on" : "off"}
      type="submit"
      className="group"
      defaultPressed={pressed}
      name="location"
    >
      <Locate className="group-data-[state=on]:animate-blink" />
    </Toggle>
  );
}

export default function Index() {
  const data = useLoaderData<typeof clientLoader>();
  return (
    <div className="max-w-screen-lg mx-auto px-8 py-8">
      <div className="flex gap-4">
        <Form className="flex gap-4 flex-1">
          <Input
            type="search"
            name="keyword"
            defaultValue={data?.query.keyword ?? ""}
            placeholder="搜尋地址"
            autoComplete="off"
          />

          <Button type="submit">送出</Button>

          {data?.query.location && (
            <input type="hidden" name="location" value={data.query.location} />
          )}
        </Form>

        <Form>
          <LocateToggle />

          {data?.query.keyword && (
            <input type="hidden" name="keyword" value={data.query.keyword} />
          )}
          {data?.query.stores && (
            <input type="hidden" name="stores" value={data.query.stores} />
          )}
        </Form>
      </div>

      {/* display the nearby stores and their near expired foods */}
      <Form className="mt-4" preventScrollReset>
        <StoreTable
          data={data.stores ?? []}
          expanded={data?.query.stores ?? undefined}
          renderSubComponent={(store) => {
            const found = data?.storesWithNearExpiredFoods?.find(
              (item) => item.storeId === store.id
            );

            return <NearExpiredFoodTable data={found?.foods ?? []} />;
          }}
        />

        {data?.query.location && (
          <input type="hidden" name="location" value={data.query.location} />
        )}
        {data?.query.keyword && (
          <input type="hidden" name="keyword" value={data.query.keyword} />
        )}
      </Form>
    </div>
  );
}
