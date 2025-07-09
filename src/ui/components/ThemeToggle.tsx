import React from 'react'
import { MoonIcon, SunIcon } from '@radix-ui/react-icons'

import { Button } from 'src/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'src/components/ui/dropdown-menu'
import { useTheme } from './ThemeProvider'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isLightMode = theme === 'light'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn(
            "relative z-10",
            isLightMode ? "text-primary" : "glow-white"
          )}
        >
          <SunIcon className={cn(
            "h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0",
            isLightMode ? "text-primary" : "text-white" 
          )} />
          <MoonIcon className={cn(
            "absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100",
            isLightMode ? "text-primary" : "text-white"
          )} />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-sidebar border-sidebar-border z-50">
        <DropdownMenuItem onClick={() => setTheme('light')} className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
          Dark
        </DropdownMenuItem>
        {/* Optionally add a 'System' theme option if needed
        <DropdownMenuItem onClick={() => setTheme('system')}>
          System
        </DropdownMenuItem> */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 