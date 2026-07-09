'use client'

import { SessionProvider } from 'next-auth/react'
import { ChakraProvider, defaultSystem  } from '@chakra-ui/react';
import { ThemeProvider } from 'next-themes';
import React from "react";

type Props = {
    children?: React.ReactNode
}

export const Providers = ({ children }: Props) => {
    return (
        <SessionProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <ChakraProvider value={defaultSystem}>
                    {children}
                </ChakraProvider>
            </ThemeProvider>
        </SessionProvider>
    );
}