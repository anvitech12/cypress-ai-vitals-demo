describe('Sanity: the AI Playground is up', () => {
  it('serves every page and the navigation works', () => {
    cy.visit('/');
    cy.get('[data-cy=brand]').should('contain', 'AI Playground');
    cy.get('[data-cy=mode-badge]').should('be.visible');
    for (const page of ['chat', 'image', 'audio', 'vitals']) {
      cy.get(`[data-cy=nav-${page}]`).click();
      cy.location('pathname').should('eq', `/${page}`);
      cy.get(`[data-cy=nav-${page}]`).should('have.attr', 'aria-current', 'page');
      cy.get('[data-cy=view]').should('have.attr', 'data-route', page);
    }
  });

  it('lists the right kind of model on each page', () => {
    cy.request('/api/models').its('body.models').then((models: Array<{ name: string; modality: string }>) => {
      const of = (kind: string) => models.filter((m) => m.modality === kind).map((m) => m.name);
      const pages: Array<[string, string[]]> = [
        ['chat', of('chat')],
        ['image', of('image')],
        ['audio', [...of('speech'), ...of('transcribe')]],
      ];
      for (const [page, names] of pages) {
        expect(names, `${page} models`).to.not.be.empty;
        cy.visit(`/${page}`);
        for (const name of names) cy.get(`[data-cy=model-option][data-model="${name}"]`).should('exist');
      }
    });
  });
});
