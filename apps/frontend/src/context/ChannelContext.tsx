import { createContext, useContext, type ReactNode } from "react";
import type { Channel } from "@/lib/channel-routes";

/**
 * В каком канале сейчас рисуются общие секции витрины — на сайте или внутри
 * мини-приложения MAX.
 *
 * Секции главной (герой, категории, хиты, акции) одни и те же для обоих
 * каналов, а вот ссылки внутри них должны вести в разные места. Прокидывать
 * канал пропсами пришлось бы через каждый уровень; контекст решает это одним
 * местом.
 *
 * По умолчанию «site» — поэтому сайт продолжает работать вообще без обёртки, и
 * забыть её на сайте невозможно. Обёртка нужна только внутри /max.
 */
const ChannelContext = createContext<Channel>("site");

export function ChannelProvider({
  channel,
  children,
}: {
  channel: Channel;
  children: ReactNode;
}) {
  return <ChannelContext.Provider value={channel}>{children}</ChannelContext.Provider>;
}

export function useChannel(): Channel {
  return useContext(ChannelContext);
}
