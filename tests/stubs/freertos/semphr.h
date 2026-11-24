#pragma once

#include <pthread.h>
#include <stdlib.h>

typedef pthread_mutex_t *SemaphoreHandle_t;

static inline SemaphoreHandle_t xSemaphoreCreateMutex(void)
{
    SemaphoreHandle_t lock = malloc(sizeof(*lock));
    if (lock) pthread_mutex_init(lock, NULL);
    return lock;
}

static inline void vSemaphoreDelete(SemaphoreHandle_t lock)
{
    pthread_mutex_destroy(lock);
    free(lock);
}

static inline void xSemaphoreTake(SemaphoreHandle_t lock, unsigned delay)
{
    (void)delay;
    pthread_mutex_lock(lock);
}

static inline void xSemaphoreGive(SemaphoreHandle_t lock)
{
    pthread_mutex_unlock(lock);
}
