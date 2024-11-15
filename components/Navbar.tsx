// components/Navbar.tsx
import React from 'react';
import { Box, Flex, Link as ChakraLink, HStack } from '@chakra-ui/react';
import Link from 'next/link';

const Navbar: React.FC = () => (
    <Box bg="gray.800" px={4}>
        <Flex h={16} alignItems="center" justifyContent="space-between">
            <Link href="/dashboard" passHref>
                <ChakraLink color="white" fontSize="xl" fontWeight="bold">
                    Admin Dashboard
                </ChakraLink>
            </Link>
            <HStack as="nav" spacing={4}>
                <Link href="/books" passHref>
                    <ChakraLink color="white">Books</ChakraLink>
                </Link>
                <Link href="/news" passHref>
                    <ChakraLink color="white">News Articles</ChakraLink>
                </Link>
            </HStack>
        </Flex>
    </Box>
);

export default Navbar;
