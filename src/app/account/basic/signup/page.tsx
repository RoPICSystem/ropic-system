"use client"

import { Button, Form, Input } from '@heroui/react'
import { login, signup } from './actions'
import { useState } from 'react'




export default function LoginPage() {
  const [isLoadingSignup, setIsLoadingSignup] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoadingSignup(true);

    try {
      const formData = new FormData(event.currentTarget)
      await signup(formData)
    } catch (error) {
      console.error('Error during login/signup:', error)
    } finally {
      setIsLoadingSignup(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg bg-content1 p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold ">Account Sign Up</h1>

        <Form className="flex flex-col w-full gap-4" onSubmit={handleSubmit}>

            <Input
              label="Email"
              color="primary"
              id="email"
              name="email"
              type="email"
              className="w-full"
              required
            />

            <Input
              label="Password"
              color="primary"
              id="password"
              name="password"
              type="password"
              className="w-full"
              required
            />

          <Button
            id="signup"
            type="submit"
            color="primary"
            variant="shadow"
            disabled={isLoadingSignup}
            isLoading={isLoadingSignup}
            className="w-full"
            >
            Sign up
          </Button>
        </Form>
      </div>
    </div>
  )
}