<template>
  <div>
    <v-toolbar app dark fixed class="blue-grey darken-2">
      <v-toolbar-side-icon @click.stop="$store.commit('toggleDrawer')"></v-toolbar-side-icon>
      <v-toolbar-title>{{ $t('menu.tags') }}</v-toolbar-title>
      <v-spacer></v-spacer>
      <transition name="fade">
        <v-btn v-if="selectedTags.length" color="error" @click="deleteSelectedTags">{{ $t('delete_selected') }}</v-btn>
      </transition>
      <v-btn color="primary" @click.stop="openAddEditTagDialog()">{{ $t('tags.add_tag') }}</v-btn>
    </v-toolbar>
    <v-content>
      <v-container fluid grid-list-lg>
        <v-layout row wrap justify-center>
          <v-flex xs12 lg10>
            <v-card>
              <v-card-title class="mb-3">
                <v-layout row wrap>
                  <v-flex xs6>
                    <v-text-field append-icon="search" :label="$t('search')" single-line hide-details
                                  v-model="search" clearable>
                    </v-text-field>
                  </v-flex>
                </v-layout>
              </v-card-title>
              <v-card-text>
                <v-data-table :headers="headers" :items="tags" :rows-per-page-items="rowsPerPage" :search="search"
                              :pagination.sync="pagination" v-model="selectedTags" select-all="primary"
                >
                  <template slot="items" slot-scope="props">
                    <td>
                      <v-checkbox color="primary" hide-details v-model="props.selected"></v-checkbox>
                    </td>
                    <td>{{ props.item.name }}</td>
                    <td>{{ props.item.description }}</td>
                    <td>
                      <v-btn icon class="mx-0" @click.stop="openAddEditTagDialog(props.item)">
                        <v-icon color="primary">edit</v-icon>
                      </v-btn>
                    </td>
                  </template>
                </v-data-table>
              </v-card-text>
            </v-card>
          </v-flex>

          <v-dialog v-model="addEditTagDialog.open" width="30%">
            <v-card>
              <v-form v-model="formValid" ref="addEditTagForm" @submit.prevent="addEditTag">
                <v-card-title>
                  <span class="headline">{{ addEditTagDialog.isEditDialog ? $t('tags.edit_tag') : $t('tags.add_tag')
                    }}</span>
                </v-card-title>
                <v-card-text>
                  <v-container grid-list-lg>
                    <v-layout row wrap>
                      <v-flex xs6>
                        <v-text-field :label="$t('tags.name')" v-model="name" required
                                      :rules="[rules.required]"></v-text-field>
                      </v-flex>
                      <v-flex xs6>
                        <v-text-field :label="$t('tags.description')" v-model="description" required
                                      :rules="[rules.required]"></v-text-field>
                      </v-flex>
                    </v-layout>
                  </v-container>
                </v-card-text>
                <v-card-actions>
                  <v-spacer></v-spacer>
                  <v-btn type="button" flat @click="addEditTagDialog.open = false">{{ $t('cancel') }}</v-btn>
                  <v-btn type="submit" flat color="primary">{{ addEditTagDialog.isEditDialog ? $t('save') : $t('add') }}</v-btn>
                </v-card-actions>
              </v-form>
            </v-card>
          </v-dialog>
        </v-layout>
      </v-container>
    </v-content>
  </div>
</template>

<script src="./tags.js"></script>