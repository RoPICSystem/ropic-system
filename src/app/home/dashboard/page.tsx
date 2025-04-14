"use client"; 

import React from "react";
import {Form, Input, Select, SelectItem, Checkbox, Button} from "@heroui/react";

export default function App() {
  return (
    <div className="flex flex-col gap-4">
      <Form className="w-full">
        <Input type="text" placeholder="Username" />
        <Input type="password" placeholder="Password" />
        <Select>
          <SelectItem key="option1">Option 1</SelectItem>
          <SelectItem key="option2">Option 2</SelectItem>
        </Select>
        <Checkbox>Remember Me</Checkbox>
        <Button type="submit">Login</Button>
      </Form>
    </div>
  );
}

