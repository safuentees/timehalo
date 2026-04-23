"use client";

import { Drawer } from "vaul";

export default function VaulDrawer() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
        Open Drawer
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 mt-24 flex h-full max-h-[96%] flex-col rounded-t-[10px] bg-white p-6">
          <Drawer.Title className="mb-4 font-medium">First Drawer</Drawer.Title>
          <Drawer.NestedRoot>
            <Drawer.Trigger className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
              Open
            </Drawer.Trigger>
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 bg-black/40" />
              <Drawer.Content className="fixed bottom-0 left-0 right-0 mt-24 flex h-full max-h-[94%] flex-col rounded-t-[10px] bg-white p-6">
                <Drawer.Title className="font-medium">Nested Drawer</Drawer.Title>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.NestedRoot>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
