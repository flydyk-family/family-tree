<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { MemberDetailDto } from '@/types/dto'

const props = defineProps<{
  member: MemberDetailDto | null
  loading: boolean
  error: string | null
}>()
const emit = defineEmits<{ close: [] }>()

const mode = ref<'normal' | 'expanded'>('normal')

// Reset to the compact layout whenever a different member is shown.
watch(
  () => props.member?.id,
  () => {
    mode.value = 'normal'
  }
)

function toggleMode(): void {
  mode.value = mode.value === 'normal' ? 'expanded' : 'normal'
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="popup" @click.self="emit('close')">
    <section class="popup__card" role="dialog" aria-modal="true" :aria-label="member?.displayName">
      <button class="popup__close" type="button" aria-label="Close" @click="emit('close')">×</button>

      <p v-if="loading" class="popup__status">Loading…</p>
      <p v-else-if="error" class="popup__status popup__status--error">{{ error }}</p>

      <template v-else-if="member">
        <header class="popup__header">
          <div class="popup__portrait" :class="{ 'popup__portrait--empty': !member.photoUrl }">
            <img v-if="member.photoUrl" :src="member.photoUrl" :alt="member.displayName" />
            <span v-else>{{ member.displayName.charAt(0) }}</span>
          </div>
          <div class="popup__heading">
            <h2 class="popup__name">{{ member.displayName }}</h2>
            <p class="popup__dates">
              <span v-if="member.birthDateText">b. {{ member.birthDateText }}</span>
              <span v-if="member.deathDateText"> – d. {{ member.deathDateText }}</span>
            </p>
            <p v-if="member.birthPlace" class="popup__place">{{ member.birthPlace }}</p>
          </div>
        </header>

        <ul v-if="member.keyFacts.length" class="popup__facts">
          <li v-for="fact in member.keyFacts" :key="fact">{{ fact }}</li>
        </ul>

        <div v-if="mode === 'expanded'" class="popup__expanded">
          <p v-if="member.bio" class="popup__bio">{{ member.bio }}</p>
          <div v-if="member.socialLinks.length" class="popup__links">
            <a
              v-for="link in member.socialLinks"
              :key="link.url"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="popup__link"
            >
              {{ link.kind }}
            </a>
          </div>
        </div>

        <button
          v-if="member.bio || member.socialLinks.length"
          class="popup__toggle"
          type="button"
          @click="toggleMode"
        >
          {{ mode === 'normal' ? 'More' : 'Less' }}
        </button>
      </template>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/mixins' as *;

.popup {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(58, 48, 38, 0.28);

  @media (min-width: $breakpoint-tablet) {
    align-items: center;
  }

  &__card {
    @include glass-surface;
    position: relative;
    width: 100%;
    max-width: 460px;
    max-height: 86vh;
    overflow-y: auto;
    padding: 24px;
    border-radius: 18px 18px 0 0;

    @media (min-width: $breakpoint-tablet) {
      border-radius: 14px;
    }
  }

  &__close {
    position: absolute;
    top: 10px;
    right: 14px;
    border: none;
    background: transparent;
    font-size: 26px;
    line-height: 1;
    color: $ink-soft;
  }

  &__status {
    margin: 16px 0;
    color: $ink-soft;

    &--error {
      color: $accent-terracotta;
    }
  }

  &__header {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  &__portrait {
    flex: 0 0 auto;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid $glass-border;
    display: flex;
    align-items: center;
    justify-content: center;
    background: $parchment-deep;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &--empty {
      font-size: 30px;
      color: $bark-light;
    }
  }

  &__name {
    margin: 0;
    font-size: 22px;
    color: $bark-shadow;
  }

  &__dates,
  &__place {
    margin: 2px 0 0;
    font-size: 14px;
    color: $ink-soft;
  }

  &__facts {
    margin: 16px 0 0;
    padding-left: 20px;
    color: $ink;

    li {
      margin: 2px 0;
    }
  }

  &__expanded {
    margin-top: 14px;
  }

  &__bio {
    margin: 0;
    line-height: 1.5;
  }

  &__links {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__link {
    padding: 4px 12px;
    border: 1px solid $glass-border;
    border-radius: 999px;
    text-decoration: none;
    color: $bark-brown;
    text-transform: capitalize;
    font-size: 14px;
  }

  &__toggle {
    margin-top: 16px;
    padding: 8px 18px;
    border: 1px solid $glass-border;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.4);
    color: $bark-brown;
  }
}
</style>
