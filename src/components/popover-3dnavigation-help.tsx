import { popoverTransition } from "@/utils/anim";
import { Popover, PopoverTrigger, Button, PopoverContent, Accordion, AccordionItem, Kbd } from "@heroui/react";
import { Icon } from "@iconify/react";


export function Popover3dNavigationHelp() {
  return (
    <Popover
      classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
      motionProps={popoverTransition('up')}
      placement="bottom">
      <PopoverTrigger>
        <Button className="capitalize" color="warning" variant="flat">
          <Icon icon="heroicons:question-mark-circle-solid" className="w-4 h-4 mr-1" />
          Help
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-4 max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <Icon icon="heroicons:lifebuoy" className="w-5 h-5 text-warning-500" width={20} />
          <h3 className="font-semibold text-lg">3D Navigation Controls</h3>
        </div>

        <Accordion variant="splitted">
          <AccordionItem key="mouse" aria-label="Mouse Controls" title="Mouse Controls" className="text-sm overflow-hidden bg-primary-50">
            <div className="space-y-2 pb-2">
              <div className="flex items-start gap-2">
                <Icon icon="heroicons:cursor-arrow-ripple" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                <p><strong>Left Click</strong>: Select a shelf</p>
              </div>
              <div className="flex items-start gap-2">
                <Icon icon="heroicons:hand-raised" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                <p><strong>Click + Drag</strong>: Rotate camera around scene</p>
              </div>
              <div className="flex items-start gap-2">
                <Icon icon="heroicons:cursor-arrow-rays" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                <p><strong>Right Click + Drag</strong>: Pan camera</p>
              </div>
              <div className="flex items-start gap-2">
                <Icon icon="heroicons:view-columns" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                <p><strong>Mouse Wheel</strong>: Zoom in/out</p>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem key="keyboard" aria-label="Keyboard Controls" title="Keyboard Controls" className="text-sm overflow-hidden bg-primary-50">
            <div className="space-y-2 pb-2">
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300">W</Kbd>
                <p className="my-auto">Move camera forward</p>
              </div>
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300">S</Kbd>
                <p className="my-auto">Move camera backward</p>
              </div>
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300">A</Kbd>
                <p className="my-auto">Move camera left</p>
              </div>
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300">D</Kbd>
                <p className="my-auto">Move camera right</p>
              </div>
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300" keys={['shift']}>W</Kbd>
                <p className="my-auto">Move camera up</p>
              </div>
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300" keys={['shift']}>S</Kbd>
                <p className="my-auto">Move camera down</p>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem key="shelf-navigation" aria-label="Shelf Navigation" title="Shelf Navigation" className="text-sm overflow-hidden bg-primary-50">
            <div className="space-y-2 pb-2">
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300" keys={['left']}></Kbd>
                <p>Move to previous shelf or group</p>
              </div>
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300" keys={['right']}></Kbd>
                <p>Move to next shelf or group</p>
              </div>
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300" keys={['up']}></Kbd>
                <p>Move to shelf above</p>
              </div>
              <div className="flex items-start gap-2">
                <Kbd className="border border-default-300" keys={['down']}></Kbd>
                <p>Move to shelf below</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex">
                  <Kbd className="border border-default-300" keys={['shift']}></Kbd>
                  <span className="mx-1">+</span>
                  <Kbd className="border border-default-300" keys={['up', 'down', 'left', 'right']}></Kbd>
                </div>
                <p>Navigate between shelf groups</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex">
                  <Kbd className="border border-default-300" keys={['ctrl']}></Kbd>
                  <span className="mx-1">+</span>
                  <Kbd className="border border-default-300" keys={['up', 'down']}></Kbd>
                </div>
                <p>Navigate shelf depth (front/back)</p>
              </div>
            </div>
          </AccordionItem>
        </Accordion>

        <div className="mt-4 border-t pt-3 border-default-200 w-full px-4">
          <h4 className="font-medium mb-2">Color Legend:</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.floorColor }}></div>
              <span className="text-xs">Floor</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.floorHighlightedColor }}></div>
              <span className="text-xs">Selected Floor</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.groupColor }}></div>
              <span className="text-xs">Group</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.groupSelectedColor }}></div>
              <span className="text-xs">Selected Group</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfColor }}></div>
              <span className="text-xs">Shelf</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfHoverColor }}></div>
              <span className="text-xs">Hovered Shelf</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfSelectedColor }}></div>
              <span className="text-xs">Selected Shelf</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.occupiedShelfColor }}></div>
              <span className="text-xs">Occupied Shelf</span>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-default-500">
          Tip: Use WASD and arrow keys for easiest navigation through the warehouse.
        </div>
      </PopoverContent>
    </Popover>
  );
}