'use client'

import { SessionProvider } from 'next-auth/react'
import { ChakraProvider, defaultSystem  } from '@chakra-ui/react';
import React from "react";

type Props = {
    children?: React.ReactNode
}

export const Providers = ({ children }: Props) => {
    return <SessionProvider>
        <ChakraProvider value={defaultSystem}>
            {children}
        </ChakraProvider>
    </SessionProvider>
}