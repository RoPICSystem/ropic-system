import React, { useState, useEffect } from 'react';
import { Button, Input, Autocomplete, AutocompleteItem, Card, CardBody, ScrollShadow } from '@heroui/react';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import { motionTransition } from "@/utils/anim";
import { toSnakeCase, toNormalCase } from '@/utils/tools';
import CustomScrollbar from './custom-scrollbar';
import { herouiColor } from '@/utils/colors';

interface CustomProperty {
  key: string;
  value: string;
}

interface CustomPropertiesProps {
  properties: Record<string, any>;
  onPropertiesChange: (properties: Record<string, any>) => void;
  onInheritFrom?: () => void;
  showInheritButton?: boolean;
  addButtonDisabled?: boolean;
  isDisabled?: boolean;
  className?: string;
}

const commonPropertyKeys = [
  "Color",
  "Brand",
  "Material",
  "Size",
  "Weight",
  "Model",
  "Serial Number",
  "Batch Number",
  "Expiry Date",
  "Manufacturer",
  "Country of Origin",
  "Category",
  "Type",
  "Grade",
  "Quality"
];

export default function CustomProperties({
  properties = {},
  onPropertiesChange,
  onInheritFrom,
  showInheritButton = false,
  addButtonDisabled = false,
  isDisabled = false,
  className = ""
}: CustomPropertiesProps) {
  const [localProperties, setLocalProperties] = useState<CustomProperty[]>([]);
  const [usedKeys, setUsedKeys] = useState<string[]>([]);
  ;
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  // Check if there's any empty property to disable the Add button
  const hasEmptyProperty = () => {
    return localProperties.some(prop => prop.key.trim() === "" || prop.value.trim() === "");
  };

  useEffect(() => {
    // Convert properties object to array format
    const propertiesArray = Object.entries(properties).map(([key, value]) => ({
      key,
      value: String(value)
    }));
    setLocalProperties(propertiesArray);

  }, [properties]);

  const handleAddProperty = () => {
    const newProperty: CustomProperty = { key: "", value: "" };
    const updatedProperties = [...localProperties, newProperty];
    setLocalProperties(updatedProperties);
    // Don't call updateProperties here since it filters out empty properties

    setUsedKeys(
      updatedProperties.map(prop => prop.key.trim()).filter(key => key !== "")
    );
  };

  const handleRemoveProperty = (index: number) => {
    const updatedProperties = localProperties.filter((_, i) => i !== index);
    setLocalProperties(updatedProperties);
    // Only update properties when explicitly removing, not when clearing individual fields
    updateProperties(updatedProperties);

    setUsedKeys(
      updatedProperties.map(prop => prop.key.trim()).filter(key => key !== "")
    );
  };

  const handlePropertyChange = (index: number, field: 'key' | 'value', value: string) => {
    const updatedProperties = localProperties.map((prop, i) =>
      i === index ? { ...prop, [field]: field === 'key' ? toSnakeCase(value) : value } : prop
    );
    setLocalProperties(updatedProperties);

    // Update parent immediately when both key and value have content
    const currentProperty = updatedProperties[index];
    if (currentProperty.key.trim() && currentProperty.value.trim()) {
      updateProperties(updatedProperties);
    }

    // Remove the automatic update when clearing fields - this was causing the issue
    setUsedKeys(
      updatedProperties.map(prop => prop.key.trim()).filter(key => key !== "")
    );
  };

  const updateProperties = (propertiesArray: CustomProperty[]) => {
    // Filter out empty properties and convert back to object
    const propertiesObject = propertiesArray
      .filter(prop => prop.key.trim() !== "" && prop.value.trim() !== "")
      .reduce((acc, prop) => {
        acc[prop.key.trim()] = prop.value;
        return acc;
      }, {} as Record<string, any>);

    onPropertiesChange(propertiesObject);
  };

  return (
    <Card className={`border-2 border-default-200 ${className} bg-default-50`}>
      <CardBody className="p-0 overflow-hidden">
        <div className="flex justify-between items-center p-4">
          <h4 className="text-lg font-semibold">Custom Properties</h4>
          <div className="flex flex-wrap justify-end gap-2">
            {showInheritButton && onInheritFrom && (
              <Button
                size="sm"
                variant="flat"
                color="secondary"
                onPress={onInheritFrom}
                startContent={<Icon icon="mdi:download" width={16} height={16} />}
                isDisabled={isDisabled}
              >
                Inherit
              </Button>
            )}
            <Button
              size="sm"
              color="primary"
              variant="flat"
              onPress={handleAddProperty}
              startContent={<Icon icon="mdi:plus" width={16} height={16} />}
              isDisabled={isDisabled || addButtonDisabled || hasEmptyProperty()}
            >
              Add
            </Button>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {localProperties.length === 0 ? (
            <motion.div {...motionTransition}>
              <div className="py-8 text-center m-4 mt-0 text-default-500 border border-dashed border-default-300 rounded-lg h-48 flex flex-col items-center justify-center">
                <Icon icon="mdi:tag-outline" className="mx-auto mb-2 opacity-50" width={32} height={32} />
                <p className="text-sm">No custom properties added yet</p>
                <Button
                  size="sm"
                  color="primary"
                  variant="light"
                  className="mt-2"
                  onPress={handleAddProperty}
                  isDisabled={isDisabled}
                >
                  Add your first property
                </Button>
              </div>
            </motion.div>
          ) : (
            <CustomScrollbar
              className='max-h-96 p-4 pt-2'
              hideHorizontalScrollbar
              scrollbarMarginBottom='.5rem'
              scrollShadow
              scrollShadowColor={herouiColor('default-50', 'hex') as string}>
              <div className="space-y-3">
                <AnimatePresence>
                  {localProperties.map((property, index) => {
                    return (
                      <motion.div key={index} {...motionTransition}>
                        <div className="flex gap-3 items-center">
                          <div className="flex-1 flex items-center">
                            <Autocomplete
                              label="Name"
                              placeholder="Enter or select property"
                              inputValue={toNormalCase(property.key)}
                              isClearable={false}
                              onInputChange={(value) => handlePropertyChange(index, 'key', value)}
                              onSelectionChange={(key) => {
                                if (key) {
                                  handlePropertyChange(index, 'key', String(key));
                                }
                              }}
                              allowsCustomValue
                              isDisabled={isDisabled}
                              size="sm"
                              inputProps={{
                                classNames: {
                                  inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16 rounded-r-none rounded-l-xl border-r-1 pb-2",
                                }
                              }}
                              disabledKeys={usedKeys}
                              startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.1rem]" width={16} />}
                            >
                              {commonPropertyKeys.map((key) => (
                                <AutocompleteItem key={toSnakeCase(key)}>
                                  {toNormalCase(key)}
                                </AutocompleteItem>
                              ))}
                            </Autocomplete>

                            <Input
                              label="Value"
                              placeholder="Enter value"
                              value={property.value}
                              onChange={(e) => handlePropertyChange(index, 'value', e.target.value)}
                              isDisabled={isDisabled}
                              size="sm"
                              classNames={{
                                inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16 rounded-r-xl rounded-l-none border-l-1 pb-2",
                              }}
                              startContent={<Icon icon="mdi:text" className="text-default-500 mb-[0.1rem]" width={16} />}
                            />
                          </div>

                          <Button
                            isIconOnly
                            size="sm"
                            color="danger"
                            variant="flat"
                            onPress={() => handleRemoveProperty(index)}
                            isDisabled={isDisabled}
                          >
                            <Icon icon="mdi:delete" width={16} height={16} />
                          </Button>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </CustomScrollbar>
          )}

        </AnimatePresence>
      </CardBody>
    </Card>
  );
}